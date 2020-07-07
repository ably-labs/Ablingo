class BingoServer {
    constructor(identity, gameId, ably, onHostRejection) {
      this.identity = identity;
      this.gameId = gameId;
      this.ably = ably;      
      this.ticker = null;
      this.onHostRejection = onHostRejection || (() => { });

      this.state = {
        settings: { server: identity, gameId: gameId, automark: false },
        status: "not-started",
        players: [],
        prizes: this.defaultPrizesObject()
      };

      this.caller = null;
      this.playerBingoCards = {};
    }
     
    async connect() {
      await this.ably.connectToGameChannel(this.identity, this.gameId);
      this.ably.sendMessage({ kind: "host-offer", serverState: this.state });
    }
  
    start(tickIntervalMs) {
      this.state.status = "running";      
      this.stop();
  
      this.caller = new BingoCaller();
      this.state.prizes = this.defaultPrizesObject();
  
      this.ably.sendMessage({ kind: "new-game", serverState: this.state });
  
      for (let player of this.state.players) {
        this.issueBingoCardToPlayer(player);
      }
      
      this.sendGameInfo();
      this.ticker = setInterval(() => { this.onGameTick(); }, tickIntervalMs);
    }
  
    stop() { 
      if (this.ticker) { clearInterval(this.ticker); }
    }
  
    onGameTick() {
      const nextCall = this.caller.getNextCall();
      
      if (nextCall.exhausted) {
        this.gameOver(null, "We ran out of numbers!");
        return;
      }

      this.ably.sendMessage({ kind: "bingo-caller-message", serverState: this.state, text: `${nextCall.call}`, number: nextCall.number });
    }
  
    onReceiveMessage(message) {
      switch(message.kind) {
        case "host-offer": this.onReceivedHostOffer(message); break;
        case "host-reject": this.onReceivedHostRejection(message); break;
        case "connected": this.onClientConnected(message); break;
        case "bingo": this.onBingo(message); break;
        default: () => { };
      }
    }

    onReceivedHostOffer(message) {
      if (!this.ably.messageIsFromMyself(message)) { 
        this.removePlayer(message.metadata.clientId);        
        this.ably.sendMessage({ kind: "host-reject", serverState: this.state }, message.metadata.clientId);
      }
    }
  
    onReceivedHostRejection(message) {  
      this.onHostRejection("I cannot host in this channel, there is already a host!");
    }
  
    onClientConnected(message) {
      if (this.state.status === "running") {        
        this.ably.sendMessage({ kind: "game-already-started", serverState: this.state }, message.metadata.clientId); 
        return;
      }

      const alreadyConnected = this.state.players.filter(x => x.clientId === message.metadata.clientId).length > 0;
      if (!alreadyConnected) { 
        this.state.players.push(message.metadata);
        this.ably.sendMessage({ kind: "connection-acknowledged", serverState: this.state }, message.metadata.clientId); 
      }

      this.sendGameInfo();
    }
  
    onBingo(message) {
      const numbersPlayerObserved = message.numbers || [];
      const validMarks = this.caller.calledNumbers.slice().filter(number => numbersPlayerObserved.indexOf(number) > -1);      
      const thisPlayer = this.state.players.filter(p => p.clientId == message.metadata.clientId)[0];
      const playerBingoCard = this.playerBingoCards[message.metadata.clientId];
      const highestAward = playerBingoCard.checkForAwards(validMarks).award;

      if (highestAward == "none") {
        return;
      }

      const winnerForThisAward = this.state.prizes[highestAward];
      if (winnerForThisAward != null) {
        return; // Prize already claimed
      }

      this.state.prizes[highestAward] = thisPlayer;   
      this.ably.sendMessage({ kind: "prize-awarded", serverState: this.state, prize: highestAward, player: thisPlayer });

      if (highestAward === "full-house") {
        this.gameOver(message.metadata, "Full house")
      }
    }

    sendGameInfo() {      
      this.ably.sendMessage({ kind: "game-info", serverState: this.state });
    }

    gameOver(winner, reason) {
      this.stop();
      this.state.status = "complete";        
      this.ably.sendMessage({ kind: "game-complete", serverState: this.state, reason: reason, winner: winner });
    }
  
    issueBingoCardToPlayer(clientMetadata) {
      const newBingoCard = new BingoCard();
      this.playerBingoCards[clientMetadata.clientId] = newBingoCard;

      this.ably.sendMessage({ kind: "bingo-card-issued", serverState: this.state, card: newBingoCard }, clientMetadata.clientId);
    }
  
    removePlayer(clientId) {
      this.state.players = this.state.players.filter(p => p.clientId !== clientId);
      delete this.playerBingoCards[clientId];
    } 

    defaultPrizesObject() { return { "one-line": null, "two-line": null, "full-house": null } };
  }

  try {
    module.exports = { BingoServer };  
  } catch { }