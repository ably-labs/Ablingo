class BingoClient {
    constructor(identity, gameId, ably, onNoHostFound, onGameAlreadyStartedError) {
      this.identity = identity;
      this.gameId = gameId;
      this.ably = ably;

      this.soundEnabled = true;
      this.onNoHostFound = onNoHostFound || (() => { });
      this.onGameAlreadyStartedError = onGameAlreadyStartedError || (() => { });

      this.serverState = null;
      this.state = this.defaultClientState("disconnected");
      this.connectionTimeoutSeconds = 10;
    }

    async connect() {
      await this.ably.connectToGameChannel(this.identity, this.gameId);
      this.ably.sendMessage({ kind: "connected" });
      this.state.status = "awaiting-acknowledgement";

      setTimeout(()=> { // Check for acknowledgement within 10 seconds.
        if (this.state.status !== "acknowledged") { this.onNoHostFound(); }
      }, 1000 * this.connectionTimeoutSeconds); 
    }
  
    onReceiveMessage(message) {
      if (message.serverState) { this.serverState = message.serverState; }

      switch(message.kind) {
        case "connection-acknowledged": this.onConnectionAcknowledged(); break;
        case "game-already-started": this.onGameAlreadyStarted(); break;
        case "new-game": this.onNewGame(message); break;
        case "bingo-card-issued": this.onReceiveBingoCard(message); break;
        case "bingo-caller-message": this.onReceiveCallerMessage(message); break;
        case "bingo": this.onPlayerShoutedBingo(); break;
        case "game-info": this.onGameStateMessageReceived(message); break;
        case "game-complete": this.onGameComplete(message); break;
        default: () => { };
      }
    }
  
    onNewGame() { this.state = this.defaultClientState(this.state.status); }  
    onConnectionAcknowledged() { this.state.status = "acknowledged"; }  
    onGameAlreadyStarted() { this.onGameAlreadyStartedError(); }
    onGameStateMessageReceived(message) {  this.serverState = message.serverState; }
    onReceiveBingoCard(message) { this.state.card = message.card; }
    onPlayerShoutedBingo() { this.say("Bingo!"); }
  
    onReceiveCallerMessage(message) {
      this.state.lastCallerMessage = message.text + " - " + message.number;
      this.say(`${message.text}, number ${message.number}`);
      
      if (this.serverState && this.serverState.settings.automark) {
        this.recordNumberClicked(message.number);
        const element = document.getElementById(message.number);
        if (element) { 
          element.classList.add("marked");
        }
      }
    }
  
    onGameComplete(message) {
      this.state.gameStateReason = message.reason;
      this.state.winner = message.winner;
    }
  
    sayBingo() { this.ably.sendMessage({ kind: "bingo", numbers: this.state.noticedNumbers }); }
    recordNumberClicked(number) { this.state.noticedNumbers.push(number); }  

    say(thing) {
        if (!window.speechSynthesis) return;
        if (!this.soundEnabled) return;
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(thing));
    }
      
    defaultClientState(clientState) { return { status: clientState, card: null, noticedNumbers: [], lastCallerMessage: "", gameStateReason: "", winner: null } };    
  }

  
  try {
    module.exports = { BingoClient };  
  } catch { }