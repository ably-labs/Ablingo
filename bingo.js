function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function shuffle(collection) {
  for (let i = collection.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [collection[i], collection[j]] = [collection[j], collection[i]];
  }
}

class Identity {
  constructor(friendlyName) {
    this.clientId = uuidv4();
    this.friendlyName = friendlyName;
  }
}

class PubSubClient {
  constructor(onMessageReceivedCallback, onAblyDisconnectionCallback) {  
    this.connected = false;   
    this.channel = null;     
    this.onMessageReceivedCallback = onMessageReceivedCallback;
    this.onAblyDisconnectionCallback = onAblyDisconnectionCallback;
  }

  async connectToGameChannel(identity, gameId) { 
    if(this.connected) return;

    this.metadata = { gameId: gameId, ...identity };

    const ably = new Ably.Realtime.Promise({ authUrl: '/api/createTokenRequest' });

    ably.connection.on('disconnected', () => {
      this.onAblyDisconnectionCallback();
    });

    const channelId = `bingo-game-${gameId}`;
    this.channel = await ably.channels.get(channelId);

    this.channel.subscribe((message) => {
      this.onMessageReceivedCallback(message.data, this.metadata);
    });

    this.connected = true;
  }

  sendMessage(message, targetClientId) {
    if (!this.connected) { throw "Client is not connected"; }

    const finalMessage = { ...message, metadata: this.metadata };
    if (targetClientId) {
      finalMessage["forClientId"] = targetClientId;
    }

    this.channel.publish({ name: "bingo-message", data: finalMessage });
  }

  messageIsFromMyself(message) {
    return this.metadata.clientId == message.metadata.clientId;
  }
}

class BingoCaller {
  constructor() {
    this.calledNumbers = [];
    this.availableNumbers = Array(90).fill(1).map( (_, i) => i+1 );
    shuffle(this.availableNumbers);

    this.calls = [ "Zero", "Kelly’s Eye", "One Little Duck", "Cup of Tea", "Knock at the Door", "Man Alive", "Tom Mix", "Lucky Seven", "Garden Gate", "Doctor’s Orders", "Cameron’s Den", "Legs eleven!", "One Dozen", "Unlucky for Some", "Valentine’s Day", "Young and Keen", "Sweet sixteem", "Dancing Queen", "Coming of Age", "Goodbye Teens", "One Score", "Royal Salute", "Two Little Ducks", "Thee and Me", "Two Dozen", "Duck and Dive", "Pick and Mix", "Gateway to Heaven", "Over Weight", "Rise and Shine", "Dirty Gertie", "Get Up and Run", "Buckle My Shoe", "Dirty Knee", "Ask for More", "Jump and Jive", "Three Dozen", "More than eleven", "Christmas Cake", "Steps", "Naughty 40", "Time for Fun", "Winnie the Pooh", "Down on Your Knees", "Droopy Drawers", "Halfway There", "Up to Tricks", "Four and Seven", "Four Dozen", "PC", "Half a Century", "Tweak of the Thumb", "Danny La Rue", "Stuck in the Tree", "Clean the Floor", "Snakes Alive", "Was She Worth It?", "Heinz Varieties", "Make Them Wait", "Brighton Line", "Five Dozen", "Bakers Bun", "Turn the Screw", "Tickle Me", "Red Raw", "Old Age Pension", "Clickety Click", "Made in Heaven", "Saving Grace", "Either Way Up", "Three Score and ten", "Bang on the Drum", "Six Dozen", "Queen B", "Candy Store", "Strive and Strive", "Trombones", "Sunset Strip", "Heaven’s Gate", "One More Time", "Eight and Blank", "Stop and Run", "Straight On Through", "Time for Tea", "Seven Dozen", "Staying Alive", "Between the Sticks", "Torquay in Devon", "Two Fat Ladies", "Nearly There", "Top of the Shop"];
  }

  getNextCall() {
    const number = this.availableNumbers.pop();
    if (number === undefined) {
      return { number: -1, call: "", exhausted: true };
    }

    this.calledNumbers.push(number);
    return { number: number, call: this.calls[number], exhausted: false };
  }
}

class BingoBlock {
  constructor(rows) {
    this.rows = rows;
  }

  validateMarkedRows(calledNumbers) {    
    let completeRows = 0;
    for (let row of this.rows) {
      const fiveNumbersMarked = row.filter(number => calledNumbers.indexOf(number) > -1).length === 5;
      if (fiveNumbersMarked) {
        completeRows++;
      }
    }

    return completeRows;
  }
}

class BingoCardGenerator {
  constructor() {
    this.validTemplate = [
      [ 0, 1, 1, 0, 0, 0, 1, 1, 1 ], [ 1, 0, 1, 0, 1, 1, 0, 1, 0 ], [ 0, 0, 1, 1, 1, 1, 1, 0, 0 ],
      [ 0, 0, 1, 1, 0, 0, 1, 1, 1 ], [ 1, 0, 0, 0, 1, 1, 1, 0, 1 ], [ 0, 1, 1, 0, 1, 0, 1, 0, 1 ],
      [ 0, 1, 0, 1, 0, 1, 1, 1, 0 ], [ 1, 0, 0, 1, 0, 1, 0, 1, 1 ], [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
      [ 0, 1, 1, 0, 1, 1, 0, 0, 1 ], [ 1, 1, 0, 0, 0, 1, 1, 1, 0 ], [ 1, 1, 0, 1, 0, 1, 0, 1, 0 ],
      [ 1, 0, 0, 1, 1, 0, 0, 1, 1 ], [ 1, 0, 0, 0, 0, 1, 1, 1, 1 ], [ 0, 1, 1, 1, 0, 0, 1, 0, 1 ],
      [ 0, 1, 1, 1, 1, 1, 0, 0, 0 ], [ 0, 1, 1, 0, 1, 0, 0, 1, 1 ], [ 1, 0, 0, 1, 1, 0, 1, 0, 1 ]
    ];
  }

  generate() {
    const template = this.validTemplate.slice();
    this.shuffle(template);
    this.populate(template);
    return template;
  }

  shuffle(template) {
    for (let i = template.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [template[i], template[j]] = [template[j], template[i]];
    }
  }

  populate(template) {    
    const usedNumbers = [];

    for (let rowIndex in template) {
      for (let colIndex in template[rowIndex]) {
          if (template[rowIndex][colIndex] === 0) {
            continue;
          }

          let minValue = colIndex * 10;
          minValue = minValue == 0 ? 1 : minValue;
          const maxValue = minValue + 9;

          const random = Math.random();
          let randomNumber = Math.floor(random * (maxValue - minValue) ) + minValue;

          if (usedNumbers.indexOf(randomNumber) > -1) {
              randomNumber = minValue;
              while (usedNumbers.indexOf(randomNumber) > -1) {   
                randomNumber++;
              }
          }

          template[rowIndex][colIndex] = randomNumber;
          usedNumbers.push(randomNumber);
      }
    }
  }
}

class BingoCard {
  constructor() {
    this.id = uuidv4();

    const generator = new BingoCardGenerator();
    const matrix = generator.generate();
    this.blocks = [];

    for (let i = 0; i < matrix.length; i += 3) {
      const rows1 = matrix[i];
      const rows2 = matrix[i + 1];
      const rows3 = matrix[i + 2];
      const block = new BingoBlock([rows1, rows2, rows3]);
      this.blocks.push(block);
    }
  }

  checkForAwards(calledNumbers) {

    let highestPrize = 0;

    for (let block of this.blocks) {
      const score = block.validateMarkedRows(calledNumbers);
      if(score > highestPrize) {
        highestPrize = score;
      }
    }

    const lookup = {
      0: "none",
      1: "one-line",
      2: "two-line",
      3: "full-house"
    }

    return { award: lookup[highestPrize] };
  }
}

class LinkGenerator {
  constructor(windowLocation) {
    this.urlRoot = `${windowLocation.protocol}//${windowLocation.host}${windowLocation.pathname}`;
  }

  linkTo(params) {
    params = params || {};
    const qsParams = Object.getOwnPropertyNames(params).map(propName => `${propName}=` + encodeURI(params[propName]));
    if (qsParams.length == 0) {
      return this.urlRoot;
    }

    const qsParamsJoined = qsParams.join("&");    
    return this.urlRoot + "?" + qsParamsJoined;
  }
}

try {
  module.exports = { Identity, PubSubClient, BingoCaller, BingoCardGenerator, BingoBlock, BingoCard, LinkGenerator };  
} catch { }