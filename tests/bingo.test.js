const { Identity, BingoCard, BingoCaller, BingoBlock, BingoCardGenerator, LinkGenerator, PubSubClient } = require("../bingo.js");

describe("Identity", () => {
    it("Generates id on creation", async () => {        
        const sut = new Identity("friendly name");
        expect(sut.clientId).toBeDefined();
        expect(sut.friendlyName).toBe("friendly name");
    });
});

describe("BingoCard", () => {
    it("Can be created", async () => {        
        const sut = new BingoCard();
        expect(sut).toBeDefined();
    });
});

describe("BingoCaller", () => {
    it("Doesn't call in the same sequence every time", async () => { 
        const sut1 = new BingoCaller();       
        const sut2 = new BingoCaller();       

        expect(sut1.availableNumbers).not.toEqual(sut2.availableNumbers);
    }); 
    
    it("Runs out of numbers without crashing", async () => {   
        const sut = new BingoCaller();
        
        for (let i = 0; i < 90; i++) {
            sut.getNextCall();
        } // Exhausted

        const outOfNumbers = sut.getNextCall();

        expect(outOfNumbers.exhausted).toBe(true);
    });
});

describe("BingoCardGenerator", () => {
    let sut;
    beforeEach(() => {
        sut = new BingoCardGenerator();
    });

    it("Can create a card", async () => {  
        const card = sut.generate();
        expect(card).toBeDefined();
    });
});

describe("BingoBlock", () => {
    let sut;
    beforeEach(() => {
        sut = new BingoBlock();
    });

    it("validateMarkedRows false when no lines completed", async () => {  
        sut.rows = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
        ];
        const observedNumbers = [1, 10, 20, 30 ];

        const score = sut.validateMarkedRows(observedNumbers);

        expect(score).toBe(0);
    });

    it("validateMarkedRows identifies one-line-bingo", async () => {  
        sut.rows = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
        ];
        const observedNumbers = [1, 10, 20, 30, 40];

        const card = sut.validateMarkedRows(observedNumbers);

        expect(card).toBe(1);
    });

    it("validateMarkedRows won't award the same block prizes twice", async () => {  
        sut.rows = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
        ];
        const observedNumbers = [1, 10, 20, 30, 40];

        let score = sut.validateMarkedRows(observedNumbers);
        score = sut.validateMarkedRows(observedNumbers);

        expect(score).toBe(1);
    });

    it("validateMarkedRows identifies two-line-bingo", async () => {  
        sut.rows = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 2, 11, 21, 31, 41, 0, 0, 0, 0 ], 
            [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
        ];
        const observedNumbers = [1, 10, 20, 30, 40, 2, 11, 21, 31, 41];

        const score = sut.validateMarkedRows(observedNumbers);

        expect(score).toBe(2);
    });

    it("validateMarkedRows identifies three-line-bingo", async () => {  
        sut.rows = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 2, 11, 21, 31, 41, 0, 0, 0, 0 ], 
            [ 3, 12, 22, 32, 42, 0, 0, 0, 0 ],
        ];
        const observedNumbers = [1, 10, 20, 30, 40, 2, 11, 21, 31, 41, 3, 12, 22, 32, 42];

        const score = sut.validateMarkedRows(observedNumbers);

        expect(score).toBe(3);
    });
});

describe("BingoCard", () => {
    let sut;
    beforeEach(() => {
        sut = new BingoCard();
        const numbers = [
            [ 1, 10, 20, 30, 40, 0, 0, 0, 0 ], 
            [ 2, 11, 21, 31, 41, 0, 0, 0, 0 ], 
            [ 3, 12, 22, 32, 42, 0, 0, 0, 0 ],
        ];
        sut.blocks = [ 
            new BingoBlock(numbers),
        ];
    });

    it("checkForAwards correctly awards one line bingo", async () => {
        const observedNumbers = [1, 10, 20, 30, 40];
        const result = sut.checkForAwards(observedNumbers);
        
        expect(result.award).toBe("one-line");
    });  
});

describe("LinkGenerator", () => {
    let sut;
    beforeEach(() => {
        sut = new LinkGenerator({
            protocol: "https:",
            host: "localhost",
            pathname: "/bingo"
        });
    });

    it("Link generator, with zero parameters, constructs", async () => {
        const result = sut.linkTo();        
        expect(result).toBe("https://localhost/bingo");
    });

    it("Link generator, with one parameter, constructs", async () => { 
        const result = sut.linkTo({ first: "val1" });        
        expect(result).toBe("https://localhost/bingo?first=val1");
    });  

    it("Link generator, with one parameter that requires encoding, urlencodes and constructs", async () => {
        const result = sut.linkTo({ first: "some thing" });        
        expect(result).toBe("https://localhost/bingo?first=some%20thing");
    });

    it("Link generator, with multiple parameters, constructs", async () => { 
        const result = sut.linkTo({ first: "val1", second: "val2" });        
        expect(result).toBe("https://localhost/bingo?first=val1&second=val2");
    }); 

    it("Link generator, with multiple parameter types, constructs", async () => { 
        const result = sut.linkTo({ first: true, second: 123 });        
        expect(result).toBe("https://localhost/bingo?first=true&second=123");
    });  
});

const fakeAblyChannel = {
    published: [],
    clear: function() { this.published = []; },
    invokeSubscriptionCallback: function () { this.callback({ data: { }}); },
    subscribe: function(callback) { this.callback = callback },
    publish: function(message) { this.published.push(message); }
}

class AblyStub {
    connection = { on: function(string) { } };
    channels = { get: function(chName) { return fakeAblyChannel; } }
}

describe("PubSubClient", () => {
    let sut;
    let onMessageReceivedCallback = (() => {});
    let onAblyDisconnectionCallback = (() => {});
    let identity = new Identity("Some Person");  

    beforeEach(() => {        
        fakeAblyChannel.clear();
        global.Ably = { Realtime: { Promise: AblyStub } };
        sut = new PubSubClient(onMessageReceivedCallback, onAblyDisconnectionCallback);
    });

    it("Constructs", () => {
        expect(sut).toBeDefined();
    });
    
    it("connectToGameChannel, saves a copy of supplied identity and gameId as metadata", async () => {        
        await sut.connectToGameChannel(identity, "game-id");

        expect(sut.metadata.clientId).toBe(identity.clientId);
        expect(sut.metadata.friendlyName).toBe(identity.friendlyName);
        expect(sut.metadata.gameId).toBe("game-id");
    }); 

    it("connectToGameChannel, messages on channel call callback provided during construction", async () => {
        let called = false;
        sut = new PubSubClient(() => { called = true; }, onAblyDisconnectionCallback);

        await sut.connectToGameChannel(identity, "game-id");
        fakeAblyChannel.invokeSubscriptionCallback();

        expect(called).toBe(true);
    });
    
    it("messageIsFromMyself, returns true if matches identity stored during connection", async () => {        
        await sut.connectToGameChannel(identity, "game-id");
        
        const result = sut.messageIsFromMyself({ metadata: { clientId: identity.clientId } });

        expect(result).toBe(true);
    }); 
    
    it("messageIsFromMyself, returns false if doesn't match identity stored during connection", async () => {        
        await sut.connectToGameChannel(identity, "game-id");
        
        const result = sut.messageIsFromMyself({ metadata: { clientId: "garbage" } });

        expect(result).toBe(false);
    }); 

    it("sendMessage, sends an ably message with the type 'bingo-message'", async () => {        
        await sut.connectToGameChannel(identity, "game-id");

        sut.sendMessage({ some: "value" })

        expect(fakeAblyChannel.published.length).toBe(1);
        expect(fakeAblyChannel.published[0].name).toBe("bingo-message");
    });  

    it("sendMessage, message body included as data property", async () => {        
        await sut.connectToGameChannel(identity, "game-id");

        sut.sendMessage({ some: "value" })

        expect(fakeAblyChannel.published[0].data.some).toBe("value");
    });

    it("sendMessage, includes a copy of the metadata stored during connection when sending", async () => {        
        await sut.connectToGameChannel(identity, "game-id");

        sut.sendMessage({ some: "value" })

        expect(fakeAblyChannel.published[0].data.metadata.clientId).toBe(identity.clientId);
        expect(fakeAblyChannel.published[0].data.metadata.friendlyName).toBe(identity.friendlyName);
        expect(fakeAblyChannel.published[0].data.metadata.gameId).toBe("game-id");
    }); 

    it("sendMessage, adds 'forClientId' property to message if provided during function call", async () => {        
        await sut.connectToGameChannel(identity, "game-id");

        sut.sendMessage({ some: "value" }, "1234")

        expect(fakeAblyChannel.published[0].data.forClientId).toBe("1234");
    });
});