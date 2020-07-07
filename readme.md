# Realtime Bingo - Ablingo!

Ablingo is a peer-to-peer bingo app, that runs in your browser tabs, powered by [Ably.io](https://www.ably.io/). It uses [Ably Realtime Channels](https://www.ably.io/documentation/realtime/channels) to connect between clients.
It's written in [Vue.js](https://vuejs.org/), runs locally, and in this example, is hosted on [Azure Static Web Apps](https://azure.microsoft.com/en-gb/services/app-service/static/).

## Contents

* [The rules of bingo](#the-rules-of-bingo)
  + [The bingo card](#the-bingo-card)
  + [Playing the game](#playing-the-game)
  + [Prize winning combinations](#prize-winning-combinations)
* [How our peer to peer game works](#how-our-peer-to-peer-game-works)
  + [Default message contents](#default-message-contents)
  + [Direct messages](#direct-messages)
  + [The Host](#the-host)
* [The bingo messages](#the-bingo-messages)
* [The message flow](#the-message-flow)
* [A note on security](#a-note-on-security)
* [The basics of a Vue app](#the-basics-of-a-vue-app)
* [The app](#the-app)
* [Web Speech API](#web-speech-api)
* [Set up a free account with Ably](#set-up-a-free-account-with-ably)
* [Running on your machine](#running-on-your-machine)
  + [Local dev pre-requirements](#locl-dev-pre-requirements)
  + [How to run for local dev](#how-to-run-for-local-dev)
* [Hosting on Azure](#hosting-on-azure)

## The rules of bingo

### The bingo card

There are six bingo tickets per card. Our bingo tickets contain 27 spaces, arranged in 9 columns and 3 rows. Each row contains 5 numbers and four blank spaces. Each column on the card can contain the numbers from it's own base ten (for example column 0 can contain 1-9, column 1 can contain 10-19, column 2 can contain 2-29 etc). All of the numbers between 1 and 90 will appear across the six tickets, meaning that the player will mark a number every time one is called.

### Playing the game

The game is progressed by the caller (who is in this case automatic). The caller will call numbers as they are randomly selected. As each number is called, players check to see where it appears on their tickets. If found, they mark it off by clicking the square containing the number. When all of the numbers required to win a prize have been marked off then the player clicks the 'Bingo' button and the game will check whether they have checked off their numbers correctly and whether or not they are the first player to claim that prize. If they are a winner their player name will be added to the list of prize winners.

### Prize winning combinations

* Single Line – covering a horizontal line of five numbers on the ticket.
* Two Lines – covering any two lines on the same ticket.
* Full House – covering all fifteen numbers on the ticket

## How our peer to peer game works

We're using [Ably Channels](https://www.ably.io/channels) to provide a peer-to-peer messaging capability to our Bingo game.

We've split our code into two JavaScript classes:

* `BingoClient` found in [bingo.lib.client.js](bingo.lib.client.js)

* `BingoServer` found in [bingo.lib.server.js](bingo.lib.server.js)

Both of these classes use logic found in [bingo.js](bingo.js) - where all our code capturing bingo game rules, calling, and scoring lives.

The UI generates a random `GameId` from a list of random animal names (from `dictionaries.js`) stitching together combinations of three names with hyphens. This `GameId` is used as our `Ably Channel Name` - so when different browsers connect to this (probably!) unique `Channel Name`, messages can be sent between participants in the game.

We also use the animal list to auto-generate player names, because they're fun.

The game begins with **one player electing themselves host** by clicking the host button in the UI. The app then creates an instance of our `BingoServer` class in that players browser - where it's stored as part of our `Vue.js` data (more on that later).

All the games players have an instance of our `BingoClient` class created and put in Vue data too - including the `Host` - as they're also a player in the game.

When either a host starts hosting, or a player joins the game, a connection to `Ably` is opened, and all `players` are subscribed to the uniquely named channel. The bingo game then plays out through a series of messages sent from the `Host` to all the `Players` (including themselves!) on a `tick` timer.

All the code in [bingo.js](bingo.js) is used by the `Host` to run the logic of the bingo game, with our `BingoCaller` class selecting a new numbers as we play.

This "one player is the host" pattern is the same way peer to peer games work everywhere, but instead of directly establishing connections between all our players, we're using [Ably Channels](https://www.ably.io/channels) to make the networking part of our games much easier.

### Default message contents

Messages from the host always contain a property called `serverState`, which the `clients` use to stay in sync.

Messages are all sent multicast (to and from everyone subscribed to the channel at the same time)

The server looks like this:

```js
this.state = {
    settings: { server: identity, gameId: gameId, automark: false },
    status: "not-started",
    players: [],
    prizes: this.defaultPrizesObject()
};

defaultPrizesObject() { return { "one-line": null, "two-line": null, "full-house": null } };
```

### Direct messages

While all messages are multicast - by convention, if a clientId is provided to the function `sendMessage` on our `PubSubClient` class, an extra property will be added to let `client` instances to either process or ignore this message.

```js
sendMessage({ kind: "some-message", serverState: this.state }, message.metadata.clientId);
```

Please remember that this **is not secure** and all clients will still receive messages destined for each player, but our `BingoClient` knows to filter out these messages from other clients, so they don't process them.

This filter exists in [index.js](index.js) when we connect to our `Ably Channel` and looks like this:

```js
function shouldHandleMessage(message, metadata) {  
    return !message.forClientId || (message.forClientId && message.forClientId === metadata.clientId); 
}

function handleMessagefromAbly(message, metadata, gameClient, gameServer) {
  if (shouldHandleMessage(message, metadata)) {
    gameServer?.onReceiveMessage(message);  
    gameClient?.onReceiveMessage(message);
  } 
}
```

We check if the property `forClientId` is in the received message, and if it is, only process the message when it it for that `client`.
We use this feature to issue bingo cards and acknowledge players joining a game.

### The Host

The `host` computer runs the logic of the game, and gets provided extra options in the UI than a regular `player`

## The bingo messages

Because this is peer to peer, we send a lot of messages between the player that is hosting, and all the other players.

| Message                   | State Change                    | Notes                              |
| :------------------------ | :------------------------------ | :--------------------------------- |
| connected                 | Client connects to game         | Sent **from** client               |
| connection-acknowledged   | Client connects to game         | Sent to specific client            |
| new-game                  | Host starts game                | All clients clear state            |
| host-offer                | Host starts hosting on channel  |                                    |
| host-reject               | Existing host rejects new one   | Prevents two hosts in same channel |
| game-info                 | Start of game, client connected |                                    |
| bingo-card-issued         | Pre-game-start                  | Sent to specific client            |
| bingo-caller-message      | Every game tick on the host     |                                    |
| bingo                     | When client clicks bingo        | Sent from a client                 |
| prize-awarded             | When a new award is made        |                                    |
| game-complete             | End of game                     |                                    |

## The message flow

The message flow orchestrates the game of bingo between the `Host Player` and all the `Clients`.
The UI, and game scoring, is determined by which messages are sent and received by the `Players`.

* A host sends out a host-offer message when they start hosting, likely nobody is listening.
* A client joins a session and sends a `connected` message
* The host sends a `connection-acknowledged` message to that specific client
* `Host Player` clicks `start` and `new-game` message is sent wiping any clients connected state
* `Host` sends all connected clients a `bingo-card-issued` with their numbers
* `Host` sends `game-info` message to make sure clients are all in sync.

* Game ticks forward and a `bingo-caller-message` is sent for each number.
* `Player` clicks `bingo` and a `bingo` message is sent, along with the number they *claim* to have seen.
* `Host` marks the `bingo` request, and if it satisfies a prize rule, a `prize-awarded` message is sent.

* Once a full-house is called, or all the possible numbers have been called, a `game-complete` message is sent.

Once the game is complete, the host can start a new game, with the same players, on the same GameId, by clicking `start` again.

## A note on security

Because this game works peer to peer, in theory, a player could join the channel and start sending host messages.
In a more mission critical setup, you would either sign the messages, or verify the host on message receipt. Please don't use this sample, if you're building systems that need to be tamper-proof.

## The basics of a Vue app

> Vue (pronounced /vjuː/, like view) is a progressive framework for building user interfaces. It is designed from the ground up to be incrementally adoptable, and can easily scale between a library and a framework depending on different use cases. It consists of an approachable core library that focuses on the view layer only, and an ecosystem of supporting libraries that helps you tackle complexity in large Single-Page Applications. 
> <cite>-- [vue.js Github repo](https://github.com/vuejs/vue)</cite>

Vue is a quick-to-start-with single-page-app framework, and we've used it to build our UI. Our Vue code lives in `index.js` - and handles all of our user interactions.

Our Vue app looks a little like this abridged sample:

```js
var app = new Vue({
  el: '#app',
  data: {
    gameClient: null
    ...
  },
  watch: {
    soundEnabled: function (val) { this.gameClient.soundEnabled = val; },
    bingoAvailable: function (val) { this.bingoAvailable = val; }
  },
  computed: {
    state: function() { return this.gameClient?.state; },
    ...
  },
  methods: {
    startGame: function(evt) { ... },
    hostGame: async function(evt) { ... },
  }
});
```

It finds an element with the ID of `app` in our markup, and treats any elements inside of it as markup that can contain `Vue Directives` - extra attributes to bind data and manipulate our HTML based on our applications state.

Typically, the Vue app makes data available (such as `gameClient` in the above code snippet), and when that data changes, it'll re-render the parts of the UI that are bound to it. We also make use of `watch` (for handling user input) and `computed` data properties in the above sample.

Vue also exposes a `method` property, where we implement things like click handlers, and callbacks from our UI.

This snippet from our Game Over screen markup, should help illustrate how Vue if-statements and markup works

```html
<div v-if="gameComplete" class="game-info game-finished">
<h1>Game Finished!</h1>
<p>Winner: {{ state?.winner?.friendlyName }}</p>
<p class="reason">Reason: {{ state?.gameStateReason }}</p>
<h2 class="play-again" v-if="youAreHost">Play again?</h2>
</div>
```

Here you'll see Vue's `v-if` directive, which means that this `div` will only display if the `gameComplete` `data` property is true.
You can also see Vue's binding syntax, where we use `{{ state?.winner?.friendlyName }}` to bind some data to our UI.

Vue is simple to get started with, especially with a small app like this, with easy to understand data-binding syntax.

## The app

Our UI is a Vue.js single page app.
It's split into three sections

* The Lobby
* The Bingo Game
* The Game Over screen

We use Vue `v-if` directives to switch between which UI elements are shown based on the `gameState`.

Our `gameState` reflects if we are connected to a currently hosted game, hosting a game ourselves, or disconnected.

Our app shows a list of connect players, some additional host controls for the host allowing them to start the game (with a few other options), and random generates player names and game names for people to enjoy.

The app also supports "deep linking" where you can send `invite only` links to your friends, which will hide the `Host` button, to make it easier for them to get straight into the game of Ablingo.

## Web Speech API

The game also supports the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - which will vocalise the bingo calls from our game when messages from the `host` are received.

It's a bit of silly fun, and there's a checkbox to disable it in case it gets a little... too... annoying ;)

## Error Handling

There are a few error cases that we will try to catch to in our `index.js` Vue app:

1. The host disconnecting
2. A client disconnecting
3. A user trying to connect to a game that is already in progress

The Ably SDK provides a callback when the websocket connection it uses is in a `disconnected` state.
If this happens, and you're a game host, you're (obviously!) unable to send messages to keep your game running.
For the sake of this real-time game, this is an unrecoverable error, and you'll have to create a new game when your internet connection is resumed. (In testing, this was normally due to WiFi dropping out, and there's not too much we can do about that!)

In that same scenario as a client, equally, you can't really finish your game, because you'll have missed numbers that have been called. You can rejoin at the end of the current session, and be issued with a fresh bingo card.

The final scenario that we're concerned with, are users attempting to join mid-game. It doesn't really make much sense to support this, so we just redirect them with an error message. They too, can join at the end of the current session.

These error callbacks are handled at the bottom of `index.js` in these three functions

```javascript
function onHostDisconnected() { ... }
function onClientDisconnected() { ... }
function onGameAlreadyStartedError() { ... }
```

## Set up a free account with Ably

In order to run this app, you will need an Ably API key. If you are not already signed up, you can [sign up now for a free Ably account](https://www.ably.io/signup). Once you have an Ably account:

* Log into your app dashboard
* Under **“Your apps”**, click on **“Manage app”** for any app you wish to use for this tutorial, or create a new one with the “Create New App” button
* Click on the **“API Keys”** tab
* Copy the secret **“API Key”** value from your Root key, we will use this later when we set up our dev environment.

## Running on your machine

While this whole application runs inside a browser, to host it anywhere people can use, we need some kind of backend to keep our `Ably API key` safe. The running version of this app is hosted on `Azure Static Web Apps (preview)` and provides us a `serverless` function that we can use to implement Ably `Token Authentication`.

The short version is - we need to keep the `Ably API key` on the server side, so people can't grab it and use up your usage quota. The client side SDK knows how to request a temporary key from an API call, we just need something to host it. In the `api` directory, there's code for an `Azure Functions` API that implements this `Token Authentication` behaviour.

`Azure Static Web Apps` automatically hosts this API for us, because there are a few .json files in the right places that it's looking for and understands. To have this same experience locally, we'll need to use the `Azure Functions Core Tools`.

### Local dev pre-requirements

We'll use live-server to serve our static files and Azure functions for interactivity

```bash
npm install -g live-server
npm install -g azure-functions-core-tools
```

Set your API key for local dev:

```bash
cd api
func settings add ABLY_API_KEY Your-Ably-Api-Key
```

Running this command will encrypt your API key into the file `/api/local.settings.json`.
You don't need to check it in to source control, and even if you do, it won't be usable on another machine.

### How to run for local dev

Run the bingo app:

```bash
npx live-server --proxy=/api:http://127.0.0.1:7071/api
```

And run the APIs

```bash
cd api
npm run start
```

or with this `bash` one-liner

```bash
npm run start --prefix api & npx live-server --proxy=/api:http://127.0.0.1:7071/api
```

There are various bash / batch files in the repository root, so in practice you can just type

```bash
run
```

to do all of the above.

## Hosting on Azure

We're hosting this as a Azure Static Web Apps - and the deployment information is in [hosting.md](hosting.md).
