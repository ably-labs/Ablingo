const { BingoClient } = require("../bingo.lib.client.js");
const { BingoServer } = require("../bingo.lib.server.js");
const { generateName } = require("../dictionaries.js");
const { Identity, PubSubClient, BingoCaller, BingoCard, LinkGenerator } = require("../bingo.js");
const vue = require("../vue.min.js");

const fakeAblyChannel = {
    published: [],
    subscribe: function(callback) { 
        this.callback = callback 
    },
    publish: function(message) { 
        this.published.push(message); 
        this.callback(message);
    }
}

class AblyStub {
    connection = { on: function(string) { } };
    channels = { get: function(chName) { return fakeAblyChannel; } }
}

global.Vue = vue;
global.Identity = Identity;
global.PubSubClient = PubSubClient;
global.generateName = generateName;
global.BingoClient = BingoClient;
global.BingoServer = BingoServer;
global.BingoCaller = BingoCaller;
global.BingoCard = BingoCard;
global.LinkGenerator = LinkGenerator;
global.Ably = { Realtime: { Promise: AblyStub } };
global.window = { location: { protocol: "https:", host: "localhost", pathname: "/bingo" } }

const { app } = require("../index.js");

describe("Vue app", () => {

    it("Creates an identity and game Id on creation", async () => { 
        expect(app.identity.friendlyName).toBeDefined();
        expect(app.identity.friendlyName).not.toBeNull();
        expect(app.gameId).toBeDefined();
        expect(app.gameId).not.toBeNull();
    });

    it("Hosting a game creates a server", async () => {
        await app.hostGame({ preventDefault: function() {}});

        expect(app.gameServer).toBeDefined();        
        expect(app.gameServer).not.toBeNull();        
    });

    it("Hosting a game creates a client", async () => {
        await app.hostGame({ preventDefault: function() {}});

        expect(app.gameClient).toBeDefined();        
        expect(app.gameClient).not.toBeNull();        
    });

    it("Joining a game creates a client", async () => {
        await app.joinGame({ preventDefault: function() {}});

        expect(app.gameClient).toBeDefined();        
        expect(app.gameClient).not.toBeNull();        
    });

    it("Number is clicked, tracks number in gameClient and adds 'marked' class", async () => {
        const fakeElement = { 
            innerHTML: "10", 
            classList: { 
                classes: [],
                add: function(clazz) { this.classes.push(clazz); } 
            } 
        };

        await app.joinGame({ preventDefault: function() {}});
        await app.numberClicked({ target: fakeElement });

        expect(app.gameClient.state.noticedNumbers[0]).toBe(10);   
        expect(fakeElement.classList.classes[0]).toBe("marked");   
    });

    it("sayBingo, sets bingoAvailable to false to prevent spam", async () => {
        await app.hostGame({ preventDefault: function() {}});
        await app.startGame({ preventDefault: function() {}});
        
        await app.sayBingo();
        
        expect(app.bingoAvailable).toBe(false);
    });
});