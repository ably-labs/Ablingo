const urlParams = new URLSearchParams(location.search);
const queryGameId = urlParams.get("gameId");
const queryMessage = urlParams.get("message");
const isInviteLink = [...urlParams.keys()].indexOf("invite") > -1;
const isHostLink = [...urlParams.keys()].indexOf("host") > -1;
const linkGenerator = new LinkGenerator(window.location);

var app = new Vue({
  el: '#app',
  data: {   
    gameClient: null,
    gameServer: null,
    
    identity: new Identity(generateName(2)),
    gameId: queryGameId || generateName(3, "-").toLocaleLowerCase(),    
    message: queryMessage || null,
    
    isInviteLink: isInviteLink,
    isHostLink: isHostLink,
    soundEnabled: false,
    bingoCallIntervalSeconds: 5,

    bingoAvailable: true,
    bingoDebounce: 5000
  },
  watch: {
    soundEnabled: function (val) { this.gameClient.soundEnabled = val; },
    bingoAvailable: function (val) { this.bingoAvailable = val; }
  },
  computed: {
    state: function() { return this.gameClient?.state; },
    transmittedServerState: function() { return this.gameClient?.serverState; },

    inviteLink: function () { return linkGenerator.linkTo({ gameId: app.gameId, invite: true }); },
    gameRunning: function () { return this.gameClient?.serverState?.status === "running"; },
    gameComplete: function () { return this.gameClient?.serverState?.status === "complete"; },
    gameReady: function () { return this.gameClient?.state?.status == "acknowledged"; },
    youAreHost: function () { return this.gameServer != null; },
    joinedOrHosting: function () { return this.gameClient != null || this.gameServer != null; },
    hasMessage: function () { return this.message != null; },
    bingoCallMs: function () { return this.bingoCallIntervalSeconds * 1000; },
    allowedToCallBingo: function () { return this.bingoAvailable && this.gameClient?.state?.noticedNumbers.length > 4; }
  },
  methods: {
    startGame: function(evt) {       
      evt.preventDefault();
      this.gameServer?.start(this.bingoCallMs); 
    },
    hostGame: async function(evt) {
      evt.preventDefault();

      const pubSubClient = new PubSubClient(
        (message, metadata) => { handleMessagefromAbly(message, metadata, this.gameClient, this.gameServer); },
        () => { onHostDisconnected() }   
      );

      this.gameServer = new BingoServer(this.identity, this.gameId, pubSubClient, () => { onHostingRejected(this); });
      await this.gameServer.connect();

      this.gameClient = new BingoClient(this.identity, this.gameId, pubSubClient);
      this.gameClient.soundEnabled = this.soundEnabled;

      await this.gameClient.connect();       
    },
    joinGame: async function(evt) { 
      evt.preventDefault();

      const pubSubClient = new PubSubClient(
        (message, metadata) => { handleMessagefromAbly(message, metadata, this.gameClient, this.gameServer); },
        () => { onClientDisconnected(); }
      );

      this.gameClient = new BingoClient(this.identity, this.gameId, pubSubClient, () => { onNoHostFound(this); }, () => { onGameAlreadyStartedError(); });
      this.gameClient.soundEnabled = this.soundEnabled;

      await this.gameClient.connect();
    },
    numberClicked: function(evt) {
      const asInt = parseInt(evt.target.innerHTML);

      if (!isNaN(asInt)) {
        this.gameClient.recordNumberClicked(asInt);
        evt.target.classList.add("marked");
      }
    },
    copyInviteLink: function(evt) {
      navigator.clipboard.writeText(this.inviteLink);
    },
    sayBingo: function(evt) {
      if (!this.bingoAvailable) return;

      this.gameClient?.sayBingo();
      this.bingoAvailable = false;
      setTimeout(() => { this.bingoAvailable = true; }, this.bingoDebounce);
    }   
  }
});

function shouldHandleMessage(message, metadata) {  return !message.forClientId || (message.forClientId && message.forClientId === metadata.clientId); }
function handleMessagefromAbly(message, metadata, gameClient, gameServer) {
  if (shouldHandleMessage(message, metadata)) {
    gameServer?.onReceiveMessage(message);  
    gameClient?.onReceiveMessage(message);
  } 
}













































function onHostingRejected(app) {
  window.location = linkGenerator.linkTo({ gameId: app.gameId, invite: true });
}

function onNoHostFound(app) {
  window.location = linkGenerator.linkTo({ gameId: app.gameId, host: true, message: "No host found - consider hosting this game!" });
}

function onHostDisconnected() {
  window.location = linkGenerator.linkTo({ gameId: app.gameId, host: true, message: "Oh no, you disconnected. You have to restart your game, as your players will have dropped out of sync. This is probably due to a problem with your internet connection." });
}

function onClientDisconnected() {
  window.location = linkGenerator.linkTo({ gameId: app.gameId, message: "You disconnected from the game - did your internet connection go down?" });
}

function onGameAlreadyStartedError() {
  window.location = linkGenerator.linkTo({ gameId: app.gameId, message: "You're trying to connect to a game that is already in progress. You'll have to wait until they finish the current round." });
}


try {
  module.exports = { app };  
} catch { }