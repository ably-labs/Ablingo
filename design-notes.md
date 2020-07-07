# Design Notes

## Bingo Card Generator

So, this is one giant hack. Before we started putting this together, we thought we knew what a bingo card looked like, but we absolutely did not.

A bingo card is actually a lot more specific than we thought when we originally looked at them.

Bingo cards are made up of six sets of three row "strips", and are marked based on the completeness of the three-row-strips.

They're a little... sudoku-ey in nature. Each row contains 9 cells horizontally, and numbers are allocated left to right sorted into tens. So the first *column* down the card only contains numbers in the range 0-9, the second 10-19, third 20-29, etc. A number can only appear once in it's vertical column.

If you're keen with maths, you'll realise that 6 sets of three, is 18 numbers in each vertical column, so some of those spaces will have to be empty. To complicate matters further, any given *row* can only contain a total of five numbers.

We spent a lot of time trying to algorithmically brute force the allocation of numbers to make sure that only the correct numbers were in each column, and only a maximum of five numbers existed on each row, but found it quite difficult, with lots of looping back over our number set to try "balance" rows that had been over allocated. I'm sure there's some clever algorithmic trick here, but instead, we went with a beautiful hack.

We googled some valid bingo card layouts, which had already been balanced by humans.

We had realised that you could reorder any given row in a valid bingo card, and the constraints would still be met. So we took a valid layout, built a generator that looped over this "valid" bingo card pattern.

Generation logic works like this -

* Foreach row in the template
* If the preset-pattern had an occupied position here, generate a valid number for this position
* If we've already used this number before, just set the value to the lower bound, and increment by one until we find a free number.
* Once each row is full, shuffle the rows.

At first we thought that might lead to limited generated patterns, and we might need to plug in a few additional bingo-card patterns, but actually, the simplest answer is probably the correct one, and what we have is plenty robust and the cards don't have noticeable patterns in them.


## PubSubClient - the Ably wrapper

At first we thought we'd just use the naked Ably client across the bingo classes, but realised by wrapping the ably client in an additional class, we could ensure that all messages sent contained certain bits of identifying data that our clients could then expect.

Our sendMessage function does three things:

* Constructs our final message by adding client metadata (Client Id, Friendly Name) to each message
* If the `targetClientId` is specified in the function call, that client Id is added as the property `forClientId` that we use in message filtering on receive.
* Publishes the message to our ably channel

The PubSubClient also contains a utility function for use in message filtering called `messageIsFromMyself` to prevent clients processing messages that they send themselves.

Ultimately, wrapping the Ably connection with this extra metadata was useful further up in the application, and meant that our BingoClient code was only really ever paying attention to message payloads, with channel joining based on names taken care of for it.

## BingoCaller

Pop quiz? Can you have duplicate numbers come out in a bingo draw?
No, we didn't know either, but apparently the answer is no.

The BingoCaller class is really pretty simple, it does two things:

* Returns a valid bingo number from a **finite set**
* Finds an occasionally slightly problematic Bingo call that in a real bingo hall, the caller would yell.

There's apparently a rich and mundane history of bingo calls, but it certainly adds to the authenticity to have them featured.

The caller instance is stateful - so every time we make a new Bingo game, we create a new caller. It in turn, shuffles every possible number from 1-90, which are then returned in order. This is, at this point, deterministic - so technically we could predict who the winner would be for the game if we were automarking the cards, but we're not, so it doesn't matter.

## Marking Bingo Cards

There's an interesting design decision here - we've chosen to only account for numbers that `players` have actively marked on their bingo cards when they yell bingo.

This means that even though the `BingoServer` could know that the players card has won, if they haven't marked the card appropriately, we won't let them have the victory.

The onBingo function in the `BingoServer` class takes care of this for us

```js  
onBingo(message) {
    const numbersPlayerObserved = message.numbers || [];
    const validMarks = this.caller.calledNumbers.slice().filter(number => numbersPlayerObserved.indexOf(number) > -1);
    const thisPlayer = this.state.players.filter(p => p.clientId == message.metadata.clientId)[0];
    const playerBingoCard = this.playerBingoCards[message.metadata.clientId];
    const highestAward = playerBingoCard.checkForAwards(validMarks).award;

    ...
}

```

We're calculating which numbers to validate against in this line

```js
const validMarks = this.caller.calledNumbers.slice().filter(number => numbersPlayerObserved.indexOf(number) > -1);
```

The client sends all the numbers the player marked, so we start with our total set of called numbers from our `BingoCaller` class, and then filter down to only the numbers the player marked on their card.

This technically means that a player can have a winning card, but can't claim their winnings. Which. Well, is the fun of it. Sucks to be them!

## On Legibility and message handling

One of the more important design decisions was to keep the client code really transparent with it's handling of messages.

All messages *not* for a specific client should be filtered out before they even reach the `onReceiveMessage` handling function. That means we can have the really readable single switch that we now have...

```js  
onReceiveMessage(message) {
    if (message.serverState) { this.serverState = message.serverState; }

    switch(message.kind) {
    case "connection-acknowledged": this.onConnectionAcknowledged(); break;
    case "new-game": this.onNewGame(message); break;
    case "bingo-card-issued": this.onReceiveBingoCard(message); break;
    case "bingo-caller-message": this.onReceiveCallerMessage(message); break;
    case "bingo": this.onPlayerShoutedBingo(); break;
    case "prize-awarded": this.onPrizeAwardedToAPlayer(message); break;
    case "game-info": this.onGameStateMessageReceived(message); break;
    case "game-complete": this.onGameComplete(message); break;
    default: () => { };
    }
}
```

This function does a lot of the heavy lifting of the client actually - copying a server state from any message that provides one, which in turn updates all the Vue UI data. Setting that one property is pretty much what passes for state management in the app.

Then we have the switch - which is just a little code organising trick to split out all the message handling code. There's nothing interesting here to note, other than perhaps the default "no-op" function, which just makes sure we don't throw errors if new messages are introduced.

This function mimics a similar, if smaller on, in the `BingoServer` - which is concerned with far fewer messages.

## Maintaining host consistency

The most important thing the `BingoHost` really does is keep track of it's state, and sends just the right ordering of messages to make sure that the `Clients` all clear down any copied of out of date state as new games begin.

We actually have redundancy here - we're sharing state with every `host` sent message, just to make sure any players dropping out, or basically anything else is always in sync.

Messages like `new-game` exist just to make sure people clear down state at the right moments. The decision was made to include the `serverState` on every outbound `host` message to stop having to *also* send `game-info` messages when players joined, or scores were updated. Given the audience for these games is relatively low (tens, hundreds? of players), making sure the messages were consistently processed made more sense than minimising the data used by each message - which isn't really a premium.

## Host Rejection

During the build, we noticed an amusing situation where two players could attempt to host the exact same game Id. While we could have implemented some kind of leader-election algorithm (see: https://docs.microsoft.com/en-us/azure/architecture/patterns/leader-election) we just went for the simple approach that if a `host` joins a game channel that is already occupied by another `host`, the existing `host` will send them a `host-rejection` message - which will redirect the second host to join the game.

There's a similar feature if a `client` attempts to join a game, but doesn't get `acknowledged` by the active `host` within 10 seconds. It's presumed that there actually isn't a host for that game, and they're redirected into `host` mode, with a little error message telling them to try hosting the game instead.

These aren't particularly sophisticated patterns, and there are more robust approaches to this, but they're definitely good enough for the scope of a bingo game.

We could probably implement a lobby system, where hosts advertise through ping-like messages, while their lobbies are open - which would really stop people "double hosting" or joining games that don't exist, but it'd probably involve writing a little more code and a little more UI than these simple tricks.

## Debouncing bingo

The first test game we ran, with the first fresh user, the bingo button happened to get spammed... 30-40 times ;)

As a result, users can only now call Bingo:

* If they've seen at least 5 numbers
* If they've haven't pressed bingo in the last five seconds

We have taken this precaution because calling `bingo` actually uses the Web Speech API to say the word "Bingo!" on all the `clients`, which actually pushes the reading of subsequent numbers back in the audio queue. You could, comically, DOS the other players use of the Speech API by spamming Bingo.