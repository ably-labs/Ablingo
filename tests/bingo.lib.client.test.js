const { BingoClient } = require("../bingo.lib.client.js");
const { Identity, BingoCard, BingoCaller, BingoBlock, BingoCardGenerator } = require("../bingo.js");

describe("BingoClient", () => {

    let sut, ablyClient;
    beforeEach(() => {
        ablyClient = {
            messages: [],
            connectCalled: false,
            sendMessage: function(m) { this.messages.push(m); },
            connectToGameChannel: function(id, gameId) { this.connectCalled = true }
        };        
        sut = new BingoClient(identity, gameId, ablyClient, onNoHostFoundCallback, onGameAlreadyStartedError);
    });

    it("Can be constructed", async () => {        
        expect(sut).toBeDefined();
        expect(sut.identity.friendlyName).toBe(identity.friendlyName);
    });

    it("Defaults client state to disconnected", async () => {
        expect(sut.state.status).toBe("disconnected");
        expect(sut.state.card).toBe(null);
    });

    it("No noticed numbers by default", async () => {        
        expect(sut.state.noticedNumbers.length).toBe(0);
    });
    
    it("connect, calls connect on Ably channel", async () => {        
        await sut.connect();

        expect(ablyClient.connectCalled).toBe(true);
    });
    
    it("connect, sends connected message and sets state to 'awaiting-acknowledgement'", async () => {        
        await sut.connect();

        expect(ablyClient.messages[0]).toStrictEqual({ kind: "connected" });
        expect(sut.state.status).toBe("awaiting-acknowledgement");
    });

    it("connect, calls onNoHostFoundCallback when connection isn't confired within timeout", async () => {        
        let noHostFoundCallbackCalled = false;
        sut = new BingoClient(identity, gameId, ablyClient, () => {
            noHostFoundCallbackCalled = true;
        }, onGameAlreadyStartedError);

        sut.connectionTimeoutSeconds = 0.1;        
        await sut.connect();
        await sleep(150);

        expect(noHostFoundCallbackCalled).toBe(true);
    });

    it("recordNumberClicked keeps track of number provided", async () => {        
        sut.recordNumberClicked(10);
        expect(sut.state.noticedNumbers[0]).toBe(10);
    });

    it("onReceiveMessage doesn't crash on unknown message", async () => {        
        sut.onReceiveMessage({ kind: "blah-blah-blah" });
    });

    it("onReceiveMessage 'bingo-card-issued', saves into local state", async () => {        
        const bingoCard = new BingoCardGenerator().generate();

        sut.onReceiveMessage({ kind: "bingo-card-issued", card: bingoCard });

        expect(sut.state.card).toBe(bingoCard);
    });

    it("onReceiveMessage 'bingo-caller-message', sets last caller message state", async () => {        
        sut.onReceiveMessage({ kind: "bingo-caller-message", text: "I'm a bingo caller", number: 10 });

        expect(sut.state.lastCallerMessage).toBe("I'm a bingo caller - 10");
    });

    it("onReceiveMessage 'bingo-caller-message', vocalises bingo call", async () => {        
        let calledOutLoud = false;        
        sut.say = () => { calledOutLoud = true; };

        sut.onReceiveMessage({ kind: "bingo-caller-message", text: "I'm a bingo caller", number: 10 });

        expect(calledOutLoud).toBe(true);
    });

    it("onReceiveMessage 'bingo-caller-message', when automark is true, tracks seen number", async () => {        
        sut.serverState = { settings: { automark: true } };

        sut.onReceiveMessage({ kind: "bingo-caller-message", text: "I'm a bingo caller", number: 10 });
        
        expect(sut.state.noticedNumbers[0]).toBe(10);
    });

    it("onReceiveMessage 'game-complete', tracks winner and gameStateReason", async () => {        
        sut.onReceiveMessage({ kind: "game-complete", reason: "test reason", winner: "test winner" });

        expect(sut.state.gameStateReason).toBe("test reason");
        expect(sut.state.winner).toBe("test winner");
    });

    it("onReceiveMessage 'connection-acknowledged', sets connection status", async () => {        
        sut.onReceiveMessage({ kind: "connection-acknowledged" });

        expect(sut.state.status).toBe("acknowledged");
    });

    it("onReceiveMessage 'game-already-started', calls game started callback", async () => {        
        let gameStartedCallbackCalled = false;
        sut = new BingoClient(identity, gameId, ablyClient, onNoHostFoundCallback, ()=>{
            gameStartedCallbackCalled = true;
        });

        sut.onReceiveMessage({ kind: "game-already-started" });

        expect(gameStartedCallbackCalled).toBe(true);
    });

    it("onReceiveMessage 'new-game', resets client state", async () => {        
        sut.state.noticedNumbers = [1, 2, 3];

        sut.onReceiveMessage({ kind: "new-game" });

        expect(sut.state).toStrictEqual(sut.defaultClientState(sut.state.status))
    });

    it("onReceiveMessage 'bingo', says Bingo", async () => {        
        let lastUtterance = "";        
        sut.say = (x) => { lastUtterance = x; };

        sut.onReceiveMessage({ kind: "bingo" });

        expect(lastUtterance).toBe("Bingo!");
    });

    it("onReceiveMessage 'game-info', updates local copy of server state", async () => {        
        sut.onReceiveMessage({ kind: "game-info", serverState: "some server state" });

        expect(sut.serverState).toBe("some server state");
    });

    it("sayBingo sends bingo message with current numbers", async () => {        
        sut.state.noticedNumbers = [1, 2, 3];

        sut.sayBingo();

        expect(ablyClient.messages[0]).toStrictEqual({ kind: "bingo", numbers: [1, 2, 3]});
    });
});

const identity = new Identity("Friendly name");
const gameId = "my-cool-game";
const onNoHostFoundCallback = (() => {});
const onGameAlreadyStartedError = (() => {});
async function sleep (msec) { return new Promise(resolve => setTimeout(resolve, msec)); }