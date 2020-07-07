const { BingoServer } = require("../bingo.lib.server.js");
const { Identity, BingoCard, BingoCaller } = require("../bingo.js");

global.BingoCaller = BingoCaller;
global.BingoCard = BingoCard;

describe("BingoServer", () => {

    let sut, ablyClient;
    beforeEach(() => {
        ablyClient = {
            messages: [],
            connectCalled: false,
            messageIsFromMyself: function (message) { return identity.clientId == message.metadata.clientId; },
            connectToGameChannel: function(id, gameId) { this.connectCalled = true },
            sendMessage: function(m, forClientId) { 
                if (forClientId) {
                    m["forClientId"] = forClientId;
                }
                this.messages.push(m); 
            }
        };
        sut = new BingoServer(identity, gameId, ablyClient, onHostRejection);
    });

    it("Can be constructed", async () => {
        expect(sut).toBeDefined();
        expect(sut.identity.friendlyName).toBe(identity.friendlyName);
    });

    it("connect, calls connect on Ably channel", async () => {
        await sut.connect();

        expect(ablyClient.connectCalled).toBe(true);
    });
    
    it("connect, sends connected message and sets game status to 'not-started'", async () => {
        await sut.connect();

        expect(ablyClient.messages[0]).toStrictEqual({ kind: "host-offer", serverState: sut.state });
        expect(sut.state.status).toBe("not-started");
    });

    it("start, sets game status to 'running'", async () => {
        sut.start(100);

        expect(sut.state.status).toBe("running");
    });

    it("start, resets awarded prize state", async () => {
        sut.start(100);

        expect(sut.state.prizes).toStrictEqual(sut.defaultPrizesObject());
    });

    it("start, sends 'new-game' message with state snapshot", async () => {
        sut.start(100);

        expect(ablyClient.messages[0]).toStrictEqual({ kind: "new-game", serverState: sut.state });
    });

    it("start, sends 'game-info' message", async () => {
        sut.start(100);

        expect(ablyClient.messages[1]).toStrictEqual({ kind: "game-info", serverState: sut.state });
    });

    it("start, issues bingo card to each joined player", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }}); // join game
        ablyClient.messages = [];
        
        sut.start(100);

        expect(ablyClient.messages[1].kind).toBe("bingo-card-issued");
        expect(ablyClient.messages[1].card).toBeDefined();
        expect(ablyClient.messages[1].forClientId).toBe("12345");
    });
    
    it("start, game ticks and calls bingo numbers on a schedule", async () => { 
        sut.start(100);
        ablyClient.messages = [];
        
        await sleep(120);

        expect(ablyClient.messages[0].kind).toBe("bingo-caller-message");
        expect(ablyClient.messages[0].number).toBeGreaterThan(0);
        expect(ablyClient.messages[0].text).not.toBe("");
    });

    it("start, game ticks until it runs out of all possible numbers, issues game over message", async () => {
        sut.start(1);
        ablyClient.messages = [];
        
        await sleep(250);

        expect(ablyClient.messages[ablyClient.messages.length -1].kind).toBe("game-complete");
        expect(ablyClient.messages[ablyClient.messages.length -1].reason).toBe("We ran out of numbers!");
    });

    it("onReceiveMessage doesn't crash on unknown message", async () => {        
        sut.onReceiveMessage({ kind: "blah-blah-blah" });
    });

    it("onReceiveMessage 'host-offer', message from myself, doesn't crash", async () => {
        sut.onReceiveMessage({ kind: "host-offer", metadata: { identity: identity } });
    });

    it("onReceiveMessage 'host-offer', message from a competing host, sends a 'host-reject' message to the spurious host", async () => { 
        const competingHostId = new Identity("someone else");
        sut.onReceiveMessage({ kind: "host-offer", metadata: { clientId: competingHostId.clientId } });

        expect(ablyClient.messages[0].kind).toBe("host-reject");
        expect(ablyClient.messages[0].forClientId).toBe(competingHostId.clientId);
    });

    it("onReceiveMessage 'host-offer', message from a competing host, removes them from active players", async () => { 
        const competingHostId = new Identity("someone else");
        sut.onReceiveMessage({ kind: "host-offer", metadata: { clientId: competingHostId.clientId } });

        expect(sut.state.players.length).toBe(0);
    });

    it("onReceiveMessage 'host-reject', calls rejection callback", async () => {
        let rejected = false;
        sut.onHostRejection = () => rejected = true;

        sut.onReceiveMessage({ kind: "host-reject" });

        expect(rejected).toBe(true);
    });

    it("onClientConnected, accepts client with 'connection-acknowledged' message", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});

        expect(ablyClient.messages[0].kind).toBe("connection-acknowledged");
        expect(ablyClient.messages[0].forClientId).toBe("12345");
    });

    it("onClientConnected, sends gameInfo to all clients with updated playerlist", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});

        expect(ablyClient.messages[1].kind).toBe("game-info");
        expect(ablyClient.messages[1].serverState).toStrictEqual(sut.state);
    });

    it("onClientConnected, if game has already started, rejects client with 'game-already-started' message", async () => {
        sut.start(100);
        await sleep(120);
        ablyClient.messages = [];

        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});

        expect(ablyClient.messages[0].kind).toBe("game-already-started");
        expect(ablyClient.messages[0].forClientId).toBe("12345");
    });

    it("onReceiveMessage 'bingo', where player is not a winner, does not crash", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});
        sut.start(100);
        await sleep(120);
        
        sut.onReceiveMessage({ kind: "bingo", metadata: { clientId: "12345" } });
    });

    it("onReceiveMessage 'bingo', where player is a one-line-bingo winner, and they notice all their numbers, and one-line prize not yet awarded, scores them appropriately", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});
        sut.start();
        sut.stop(); // We're gonna manully step the game forwards in this test, just making sure the state is all correct.

        sut.playerBingoCards["12345"].blocks[0].rows[0] = [ 1, 0, 20, 30, 40, 50, 0, 0, 0 ];

        tickGameForwardsCallingTheseNumbers(sut, [ 1, 20, 30, 40, 50 ]);                
        sut.onReceiveMessage({ kind: "bingo", metadata: { clientId: "12345" }, numbers: [ 1, 20, 30, 40, 50 ] });

        expect(ablyClient.messages[ablyClient.messages.length - 1].kind).toBe("prize-awarded");
        expect(ablyClient.messages[ablyClient.messages.length - 1].prize).toBe("one-line");
    });

    it("onReceiveMessage 'bingo', where player is a bingo winner, and they notice all their numbers, and prize for that catagory HAS BEEN awarded, scores nothing", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "1" }});
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "2" }});
        sut.start();
        sut.stop(); // We're gonna manully step the game forwards in this test, just making sure the state is all correct.

        sut.playerBingoCards["1"].blocks[0].rows[0] = [ 1, 0, 20, 30, 40, 50, 0, 0, 0 ];
        sut.playerBingoCards["2"].blocks[0].rows[0] = [ 1, 0, 20, 30, 40, 50, 0, 0, 0 ]; // unlikely the have the same card, but *shrug*
        tickGameForwardsCallingTheseNumbers(sut, [ 1, 20, 30, 40, 50 ]);                

        sut.onReceiveMessage({ kind: "bingo", metadata: { clientId: "1" }, numbers: [ 1, 20, 30, 40, 50 ] }); // First player wins prize here
        sut.onReceiveMessage({ kind: "bingo", metadata: { clientId: "2" }, numbers: [ 1, 20, 30, 40, 50 ] }); // Second player tries to claim prize

        expect(ablyClient.messages[ablyClient.messages.length - 1].player).toStrictEqual({ clientId: "1"}); // Client 1 awarded prize
    });

    it("onReceiveMessage 'bingo', where player is a full-house winner, and they notice all their numbers, finishes the game", async () => {
        sut.onReceiveMessage({ kind: 'connected', metadata: { clientId: "12345" }});
        sut.start();
        sut.stop(); // We're gonna manully step the game forwards in this test, just making sure the state is all correct.

        sut.playerBingoCards["12345"].blocks[0].rows[0] = [ 1, 0, 20, 30, 40, 50, 0, 0, 0 ];
        sut.playerBingoCards["12345"].blocks[0].rows[1] = [ 2, 0, 21, 31, 41, 51, 0, 0, 0 ];
        sut.playerBingoCards["12345"].blocks[0].rows[2] = [ 3, 0, 22, 32, 42, 52, 0, 0, 0 ];

        tickGameForwardsCallingTheseNumbers(sut, [ 1, 2, 3, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52 ]);
        
        sut.onReceiveMessage({ kind: "bingo", metadata: { clientId: "12345" }, numbers: [ 1, 2, 3, 20, 21, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52 ] });

        expect(ablyClient.messages[ablyClient.messages.length - 2].kind).toBe("prize-awarded");
        expect(ablyClient.messages[ablyClient.messages.length - 2].prize).toBe("full-house");
        expect(ablyClient.messages[ablyClient.messages.length - 1].kind).toBe("game-complete");
        expect(ablyClient.messages[ablyClient.messages.length - 1].winner).toStrictEqual({ clientId: "12345" });
    });
});

const identity = new Identity("Friendly name");
const gameId = "my-cool-game";
const onHostRejection = (() => {});
async function sleep (msec) { return new Promise(resolve => setTimeout(resolve, msec)); }

function tickGameForwardsCallingTheseNumbers(sut, arrayOfNumbers) {
    const length = arrayOfNumbers.length;
    sut.caller.availableNumbers = arrayOfNumbers.slice();
    for (let i = 0; i < length; i++) {
        sut.onGameTick();        
    }
}