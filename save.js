/*
TM AI

Copyright (C) 2013 by Lode Vandevenne

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

    1. The origin of this software must not be misrepresented; you must not
    claim that you wrote the original software. If you use this software
    in a product, an acknowledgment in the product documentation would be
    appreciated but is not required.

    2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.

    3. This notice may not be removed or altered from any source
    distribution.
*/

//serialization of gamestate, backing it up, and Undo

// Creates a clone of the Game object, and adds state and, optionally, log as fields (set logText to undefined to not have it)
function saveGameState(game, state, logText) {
  var result = clone(game);
  result.state = clone(state);
  if(logText) result.logText = logText;
  return result;
}

// Loads the gamestate from the given saveGameState result, puts it in the various global variables and recalculates some global variables
function loadGameState(fromgame) {
  game = clone(fromgame);
  state = fromgame.state;
  if(fromgame.logText) {
    logText = fromgame.logText;
    logEl.innerHTML = logText;
  }
  // These objects were only in the save object, but should not be in the game object.
  delete game.state;
  delete game.logText;

  waterDistanceCalculated = [];
  recalculateColorMaps();
  calculateTownClusters();
  //calculateNetworkClusters();
}

//same as loadGameState, but also reinits
function loadGameStateHard(game) {
  loadGameState(game);
  clearHumanState();
  showingNextButtonPanel = false;
  pactions = [];

  popupElement.innerHTML = '';
  uiElement.innerHTML = '';
  drawMap();
  drawMapClick();
  drawSaveLoadUI(false);
  drawHud();
  displayLog();

  gameLoopNonBlocking(state.type, false); //this is an alternative rather than doing state.executeActor() above, but requires player to press "Next"
}

//Auto save and load
function autoSave(game, state, logText) {
  if (localStorage.online && localStorage['network.url']) {
    network.save(
      localStorage['network.url'],
      localStorage['network.auth'],
      serializeGameState(saveGameState(game, state, logText))
    );
  }

  // shouldn't this check the preferences??
  localStorage['autoSaveData'] = serializeGameState(saveGameState(game, state, logText));
}

function autoLoad() {
  if (localStorage.online && localStorage['network.url']) {
    network.load(localStorage['network.url'], localStorage['network.auth']).then((data) => {
      const game = deSerializeGameState(data);
      if (game) {
        loadGameStateHard(game);
        if (!savedGame.logText) addLog('<br/>Loaded a game without log<br/>');
        return;
      }
      throw '';

    }).catch(() => {
      // bring back to the menu
      renderPreScreen(0, 135, startGameButtonFun, startRandomGameButtonFun, startBeginnerGameButtonFun, startQuickGameButtonFun);
    });

    return true;
  }

  if(localStorage['autoSaveData']) {
    var game = deSerializeGameState(localStorage['autoSaveData']);
    if(game) {
      loadGameStateHard(game);
      if(!game.logText) addLog('<br/>Loaded a game without log<br/>');
    }
    return true;
  }
  return false;
}

function clearAutoSave() {
  if(localStorage['autoSaveData']) {
    delete localStorage.autoSaveData;
  }
}

//returns it as a string
function serializeGameState(fromgame) {
  var result = '';
  var comma = false;

  result += 'size:\n';
  result += '' + fromgame.bw + ',' + fromgame.bh + ',' + fromgame.btoggle;
  result += '\n';

  var togglemod = (fromgame.btoggle ? 0 : 1);

  result += '\nlandscape:\n';
  for (var i = 0; i < fromgame.world.length; i++) {
    var y = Math.floor(i / fromgame.bw);
    var x = i % fromgame.bw;
    if(x == 0 && y % 2 == togglemod) result += ' ';
    result += colorCodeName[fromgame.world[i]] + ',';
    if(x == fromgame.bw - 1) result += '\n';
  }

  result += '\nbuildings:\n';
  for (var i = 0; i < fromgame.buildings.length; i++) {
    var y = Math.floor(i / fromgame.bw);
    var x = i % fromgame.bw;
    if(x == 0 && y % 2 == togglemod) result += ' ';
    result += buildingCodeName[fromgame.buildings[i][0]] + colorCodeName[fromgame.buildings[i][1]] + ',';
    if(x == fromgame.bw - 1) result += '\n';
  }

  result += '\nbridges:\n';
  comma = false;
  for(var y = 0; y < fromgame.bh; y++) {
    for(var x = 0; x < fromgame.bw; x++) {
      for(var z = 0; z < 3; z++) {
        if(fromgame.bridges[arCo2(x, y, fromgame.bw)][z] != N) {
          var co = bridgeCo(x, y, [D_N, D_NE, D_SE][z], fromgame.btoggle);
          if (comma) result += ',';
          result += printCo(x, y) + printCo(co[0], co[1]) + colorCodeName[fromgame.bridges[arCo2(x, y, fromgame.bw)][z]];
          comma = true;
        }
      }
    }
  }
  result += '\n';

  result += '\ncultpriests:\n';
  for(var i = 0; i < 16; i++) {
    result += colorCodeName[fromgame.cultp[Math.floor(i / 4)][i % 4]];
    if(i < 15) result += ',';
  }
  result += '\n';

  result += '\ntiles:\n';

  result += 'bon=';
  comma = false;
  for(var i = T_BON_BEGIN + 1; i < T_BON_END; i++) {
    if(fromgame.bonustiles[i]) {
      if (comma) result += ',';
      result += getTileCodeName(i) + ' ' + undef0(fromgame.bonustilecoins[i]);
      comma = true;
    }
  }
  result += '\n';

  result += 'fav=';
  comma = false;
  for(var i = T_FAV_BEGIN + 1; i < T_FAV_END; i++) {
    if(fromgame.favortiles[i]) {
      if (comma) result += ',';
      result += getTileCodeName(i) + ' ' + undef0(fromgame.favortiles[i]);
      comma = true;
    }
  }
  result += '\n';

  result += 'tw=';
  comma = false;
  for(var i = T_TW_BEGIN + 1; i < T_TW_END; i++) {
    if(fromgame.towntiles[i]) {
      if (comma) result += ',';
      result += getTileCodeName(i) + ' ' + undef0(fromgame.towntiles[i]);
      comma = true;
    }
  }
  result += '\n';

  result += 'rnd=';
  for(var i = 1; i <= 6; i++) result += '' + getTileCodeName(fromgame.roundtiles[i]) + (i == 6 ? '\n' : ',');

  result += 'oct=';
  comma = false;
  for(var j = A_BEGIN + 1; j < A_END; j++) {
    if(fromgame.octogons[j]) {
      if (comma) result += ',';
      result += getActionCodeName(j);
      comma = true;
    }
  }
  result += '\n';

  result += '\ngamestate:\n';
  result += 'state=' + getGameStateCodeName(fromgame.state.type) + ',' + fromgame.state.round + ',' + fromgame.state.startPlayer + ',' + fromgame.state.currentPlayer + '\n';
  result += 'leech=' + fromgame.state.leechi + ',' + fromgame.state.leechtaken;
  for(var i = 0; i < fromgame.state.leecharray.length; i++) {
      result += ',' + fromgame.state.leecharray[i][0] + ' ' + fromgame.state.leecharray[i][1];
  }
  result += '\n';

  if(fromgame.state.turnorder) {
    result += '\nturnorder:\n';
    result += fromgame.state.currentOrder + ',' + fromgame.state.passOrder + '\n';
    for(var i = 0; i < fromgame.state.turnMatrix[0].length; i++) result += (i == 0 ? '' : ',') + fromgame.state.turnMatrix[0][i];
    result += '\n';
    for(var i = 0; i < fromgame.state.turnMatrix[1].length; i++) result += (i == 0 ? '' : ',') + fromgame.state.turnMatrix[1][i];
    result += '\n';
  }

  result += '\noptions:\n';
  comma = false;
  if(state.newcultistsrule) { result += 'newcultistsrule'; comma = true; }
  if(state.towntilepromo2013) { if(comma) result += ','; result += 'towntilepromo2013'; comma = true; }
  if(state.bonustilepromo2013) { if(comma) result += ','; result += 'bonustilepromo2013'; comma = true; }
  if(state.fireice) { if(comma) result += ','; result += 'fireice'; comma = true; }
  if(state.fireiceerrata) { if(comma) result += ','; result += 'fireiceerrata'; comma = true; }
  if(state.roundtilepromo2015) { if(comma) result += ','; result += 'roundtilepromo2015'; comma = true; }
  if(state.autoSave) { if(comma) result += ','; result += 'autoSave'; comma = true; }
  result += '\n';

  result += '\nrules:\n';
  result += 'scoring=' + finalScoringCodeNames[fromgame.finalscoring];
  result += '\n';

  for(var i = 0; i < fromgame.players.length; i++) {
    var p = fromgame.players[i];
    result += '\nplayer:\n';

    result += 'bio=';
    var riverwalkerscolorstring = ''; //e.g. 1010101, indicates which of the 7 colors are available
    if(p.color == Z) {
      riverwalkerscolorstring = ',';
      for(var j = 0; j < p.colors.length; j++) riverwalkerscolorstring += (p.colors[j] ? '1' : '0');
    }
    result += p.name + ',' + (p.human ? 'human' : 'ai') + ',' + getFactionCodeName(p.getFaction()) + ',' +
        colorCodeName[p.color] + ',' + colorCodeName[p.auxcolor] + ',' + colorCodeName[p.woodcolor] + riverwalkerscolorstring + '\n'

    result += 'passed=';
    result += p.passed + '\n';

    result += 'res=';
    result += p.c + ',' + p.w + ',' + p.p + ',' + p.pp + ',' + p.pw0 + ',' + p.pw1 + ',' + p.pw2 + ',' + p.vp + '\n';

    result += 'buildings=';
    result += p.b_d + ',' + p.b_tp + ',' + p.b_te + ',' + p.b_sh + ',' + p.b_sa + ',' + p.bridgepool + '\n';

    result += 'bon=';
    result += '' + getTileCodeName(p.bonustile ? p.bonustile : T_NONE) + '\n';

    result += 'fav=';
    comma = false;
    for(var j = T_FAV_BEGIN + 1; j < T_FAV_END; j++) {
      if(p.favortiles[j]) {
        if (comma) result += ',';
        result += getTileCodeName(j) + ' ' + 1; // the 1 is useless but is for consistency
        comma = true;
      }
    }
    result += '\n';

    result += 'tw=';
    comma = false;
    for(var j = T_TW_BEGIN + 1; j < T_TW_END; j++) {
      if(p.towntiles[j]) {
        if (comma) result += ',';
        result += getTileCodeName(j) + ' ' + p.towntiles[j];
        comma = true;
      }
    }
    result += '\n';

    result += 'oct=';
    comma = false;
    for(var j = A_BEGIN + 1; j < A_END; j++) {
      if(p.octogons[j]) {
        if (comma) result += ',';
        result += getActionCodeName(j);
        comma = true;
      }
    }
    result += '\n';

    result += 'cult=';
    result += p.cult[0] + ',' + p.cult[1] + ',' + p.cult[2] + ',' + p.cult[3] + ',' + p.keys + '\n';

    result += 'adv=';
    result += p.shipping + ',' + p.digging + '\n';
    // player.tunnelcarpetdistance not saved: is instead calculated after loading

    result += 'vpreason=';
    comma = false;
    var vpbreakdown = '';
    for(var name in p.vp_reason) {
      if(comma) vpbreakdown += ',';
      vpbreakdown += name + ' ' + p.vp_reason[name];
      comma = true;
    }
    result += vpbreakdown + '\n';

    result += 'vpdetail=';
    comma = false;
    vpbreakdown = '';
    for(var name in p.vp_detail) {
      if(comma) vpbreakdown += ',';
      vpbreakdown += name + ' ' + p.vp_detail[name];
      comma = true;
    }
    result += vpbreakdown + '\n';
  }

  if(fromgame.logText) {
    result += '\nlog:\n';
    result += fromgame.logText.replace(/<br\/>/g, '\n');
  }

  return result;
}

function parseLabelPart(text, label, n) {
  if(!n) n = 0;
  var begin = text.indexOf(label) + label.length;
  if(begin < label.length) return null;
  while(n > 0) {
    n--;
    begin = text.indexOf(label, begin) + label.length;
    if(begin < label.length) return null;
  }
  var end = text.indexOf(':', begin + label.length + 1);
  if(end < 0) end = text.length;
  while(begin < text.length && text.charCodeAt(begin) < 32) begin++; //skip newlines
  while(text.charCodeAt(end) > 32) end--; //skip to previous line
  if(end <= begin) return '';
  return text.substring(begin, end);
}


//returns array of bw * bh strings
function parseWorldString(text, label, n) {
  var s = parseLabelPart(text, label, n);
  if(!s) return null;
  return getCommas(s);
}

function getLines(text) {
  return text.split(/\r\n|\r|\n/);
}

function getNonEmptyLines(text) {
  lines = getLines(text);
  for(var i = 0; i < lines.length; i++) {
    if(lines[i] == '') {
      lines.splice(i, 1);
      i--;
    }
  }
  return lines;
}

// Get the words separated by commas
function getCommas(text) {
  if(text == '' || !text) return [];
  var result = text.split(',');
  for(var i = 0; i < result.length; i++) result[i] = result[i].trim();
  return result;
}

// Get the words separated by spaces
function getSpaces(text) {
  if(text == '' || !text) return [];
  var s = text.split(' ');
  var result = [];
  for(var i = 0; i < s.length; i++) {
    if(s[i].length > 0) result.push(s[i].trim());
  }
  return result;
}

//get anything that is separated by whitespace or punctuation
function getWords(text) {
  if(text == '' || !text) return [];
  return text.trim().split(/[,.]*\s+/);
}

function decomposeEqualsLine(text) {
  return text.split('=');
}

function deSerializeGameState(text) {
  var result = deSerializeGameStateNewFormat(text);
  if (result) return result;

  if(stringContains(text, 'landscape:')) {
    result = deSerializeGameStateLegacyFormat(text);
    if (result) return result;
  }

  if(stringContains(text, 'List players') || stringContains(text, 'show history') || stringContains(text, 'Removing tile')) {
    result = deSerializeGameStateSnellmanLog(text);
    if (result) return result;
  }

  return null;
}

//returns null on fail (invalid text, ...)
function deSerializeGameStateNewFormat(text) {
  var result = saveGameState(new Game(), new State(), undefined); //a way to get an initialized object

  var s;
  var d;
  var lines; //lines of a section
  var el; //split line

  s = parseLabelPart(text, 'size:');
  el = getCommas(s);
  if(el.length < 2) return null;
  result.bw = parseInt(el[0]);
  result.bh = parseInt(el[1]);
  result.btoggle = (el[2] == 'true');

  s = parseWorldString(text, 'landscape:');
  if(!s || s.length < result.bw * result.bh) return null;
  for(var i = 0; i < result.bw * result.bh; i++) result.world[i] = codeNameToColor[s[i]];

  s = parseWorldString(text, 'buildings:');
  if(!s || s.length < result.bw * result.bh) return null;
  for(var i = 0; i < result.bw * result.bh; i++) {
    var building = codeNameToBuilding[s[i].substr(0, 1)];
    var char1 = s[i].substr(1, 2);
    var color;
    if(char1) {
      color = codeNameToColor[char1];
    } else {
      color = building == B_NONE ? N : result.world[i];
      if(building == B_MERMAIDS) color = B;
    }

    result.buildings[i] = [building, color];
  }

  s = parseLabelPart(text, 'bridges:');
  el = getCommas(s);
  initBridges(result.bridges, result.bw, result.bh);

  for(var i = 0; i < el.length; i++) {
    var b = el[i];
    if(b.length < 5) return null; //expected format something like A1B2R, or larger like A11B12R (last letter is color)
    var secondletterpos = 0;
    for(var j = 1; j < b.length; j++) {
      if(b.charCodeAt(j) >= 65 /*'A'*/ && b.charCodeAt(j) <= 90 /*'Z'*/) {
        secondletterpos = j;
        break;
      }
    }
    var co0 = parsePrintCo(b.substring(0, secondletterpos));
    var co1 = parsePrintCo(b.substring(secondletterpos, b.length - 1));
    var color = codeNameToColor[b[b.length - 1]];
    addBridgeTo(co0[0], co0[1], co1[0], co1[1], result.bw, result.btoggle, color, result.bridges);
  }

  s = parseLabelPart(text, 'cultpriests:');
  el = getCommas(s);
  if(el.length != 16) return null;
  for(var i = 0; i < 16; i++) {
    result.cultp[Math.floor(i / 4)][i % 4] = codeNameToColor[el[i]];
  }

  s = parseLabelPart(text, 'tiles:');
  lines = getNonEmptyLines(s);
  if(lines.length != 5) return null;

  d = decomposeEqualsLine(lines[0]);
  if(d[0] != 'bon') return null;
  el = getCommas(d[1]);
  for(var i = T_BON_BEGIN + 1; i < T_BON_END; i++) result.bonustiles[i] = 0;
  for(var i = 0; i < el.length; i++) {
    var t = getSpaces(el[i]);
    result.bonustiles[codeNameToTile(t[0])] = 1;
    result.bonustilecoins[codeNameToTile(t[0])] = parseInt(t[1]);
  }

  d = decomposeEqualsLine(lines[1]);
  if(d[0] != 'fav') return null;
  el = getCommas(d[1]);
  for(var i = T_FAV_BEGIN + 1; i < T_FAV_END; i++) result.favortiles[i] = 0;
  for(var i = 0; i < el.length; i++) {
    var t = getSpaces(el[i]);
    result.favortiles[codeNameToTile(t[0])] = parseInt(t[1]);
  }

  d = decomposeEqualsLine(lines[2]);
  if(d[0] != 'tw') return null;
  el = getCommas(d[1]);
  for(var i = T_TW_BEGIN + 1; i < T_TW_END; i++) result.towntiles[i] = 0;
  for(var i = 0; i < el.length; i++) {
    var t = getSpaces(el[i]);
    result.towntiles[codeNameToTile(t[0])] = parseInt(t[1]);
  }

  d = decomposeEqualsLine(lines[3]);
  if(d[0] != 'rnd') return null;
  el = getCommas(d[1]);
  if(el.length != 6) return null;
  for(var i = 0; i < el.length; i++) {
    result.roundtiles[i + 1] = codeNameToTile(el[i]);
  }
  result.roundtiles[0] = T_NONE;

  d = decomposeEqualsLine(lines[4]);
  if(d[0] != 'oct') return null;
  el = getCommas(d[1]);
  result.octogons = {};
  for(var i = 0; i < el.length; i++) {
    result.octogons[codeNameToAction(el[i])] = 1;
  }

  s = parseLabelPart(text, 'gamestate:');
  lines = getNonEmptyLines(s);
  if(lines.length != 2) return null;

  d = decomposeEqualsLine(lines[0]);
  if(d[0] != 'state') return null;
  el = getCommas(d[1]);
  if(el.length != 4) return null;
  result.state.type = codeNameToGameState(el[0]);
  result.state.round = parseInt(el[1]);
  result.state.startPlayer = parseInt(el[2]);
  result.state.currentPlayer = parseInt(el[3]);

  d = decomposeEqualsLine(lines[1]);
  if(d[0] != 'leech') return null;
  el = getCommas(d[1]);
  if(el.length < 2) return null;
  result.state.leechi = parseInt(el[0]);
  result.state.leechtaken = parseInt(el[1]);
  result.state.leecharray = [];
  for(var i = 2; i < el.length; i++) {
    var t = getSpaces(el[i]);
    result.state.leecharray.push([parseInt(t[0]), parseInt(t[1])]);
  }

  s = parseLabelPart(text, 'turnorder:');
  if(s) {
    lines = getNonEmptyLines(s);
    if(lines.length > 3 || lines.length < 1) return null;

    result.state.turnMatrix = [[],[]];
    result.state.turnorder = true;

    el = getCommas(lines[0]);
    if(el.length != 2) return null;
    result.state.currentOrder = parseInt(el[0]);
    result.state.passOrder = parseInt(el[1]);

    if(lines.length >= 2) {
      el = getCommas(lines[1]);
      for(var i = 0; i < el.length; i++) result.state.turnMatrix[0][i] = parseInt(el[i]);
    }
    if(lines.length >= 3) {
      el = getCommas(lines[2]);
      for(var i = 0; i < el.length; i++) result.state.turnMatrix[1][i] = parseInt(el[i]);
    }
  } else {
    result.state.turnorder = false;
  }

  s = parseLabelPart(text, 'options:');
  if(s || s == '' /*empty string is falsy*/) {
    result.state.newcultistsrule = stringContains(s, 'newcultistsrule');
    result.state.towntilepromo2013 = stringContains(s, 'towntilepromo2013');
    result.state.bonustilepromo2013 = stringContains(s, 'bonustilepromo2013');
    result.state.fireice = stringContains(s, 'fireice');
    result.state.fireiceerrata = stringContains(s, 'fireiceerrata');
    result.state.roundtilepromo2015 = stringContains(s, 'roundtilepromo2015');
    result.state.autoSave = stringContains(s, 'autoSave');
  }

  s = parseLabelPart(text, 'rules:');
  if(s || s == '' /*empty string is falsy*/) {
    lines = getNonEmptyLines(s);
    if(lines.length != 1) return null;
    d = decomposeEqualsLine(lines[0]);
    if(d[0] != 'scoring') return null;
    el = getCommas(d[1]);
    if(el.length == 0) return null;
    result.finalscoring = nameToFinalScoring[el[0]];
  } else {
    result.finalscoring = nameToFinalScoring['network'];
  }

  var index = 0;
  result.players = [];
  while(true) {
    s = parseLabelPart(text, 'player:', index);
    if(s == null) {
      if(index == 0) return null;
      else break;
    }
    lines = getNonEmptyLines(s);
    if(lines.length != 12) return null;
    var player = new Player();
    result.players[index] = player;

    player.index = index;

    d = decomposeEqualsLine(lines[0]);
    if(d[0] != 'bio') return null;
    el = getCommas(d[1]);
    if(el.length != 4 && el.length != 5 && el.length != 6 && el.length != 7) return null;
    player.name = el[0];
    player.human = (el[1] == 'human');
    if(player.human) player.actor = new Human();
    else player.actor = newAI();
    player.setFaction(codeNameToFaction(el[2]));
    player.color = codeNameToColor[el[3]];
    player.auxcolor = (el.length > 4 ? codeNameToColor[el[4]] : player.color);
    player.woodcolor = (el.length > 5 ? codeNameToColor[el[5]] : player.color);
    var riverwalkerscolorstring = el[6];
    player.colors = [false,false,false,false,false,false,false];
    if(riverwalkerscolorstring) {
      for(var i = 0; i < riverwalkerscolorstring.length; i++) player.colors[i] = (riverwalkerscolorstring[i] == '1');
    }

    player.getFaction().setStartSituation(player); //this also inits resources and cults, so ensure that those get loaded after this, not before

    d = decomposeEqualsLine(lines[1]);
    if(d[0] != 'passed') return null;
    player.passed = (d[1] == 'true');

    d = decomposeEqualsLine(lines[2]);
    if(d[0] != 'res') return null;
    el = getCommas(d[1]);
    if(el.length != 8) return null;
    player.c = parseInt(el[0]);
    player.w = parseInt(el[1]);
    player.p = parseInt(el[2]);
    player.pp = parseInt(el[3]);
    player.pw0 = parseInt(el[4]);
    player.pw1 = parseInt(el[5]);
    player.pw2 = parseInt(el[6]);
    player.vp = parseInt(el[7]);


    d = decomposeEqualsLine(lines[3]);
    if(d[0] != 'buildings') return null;
    el = getCommas(d[1]);
    if(el.length != 6) return null;
    player.b_d = parseInt(el[0]);
    player.b_tp = parseInt(el[1]);
    player.b_te = parseInt(el[2]);
    player.b_sh = parseInt(el[3]);
    player.b_sa = parseInt(el[4]);
    player.bridgepool = parseInt(el[5]);

    d = decomposeEqualsLine(lines[4]);
    if(d[0] != 'bon') return null;
    el = getCommas(d[1]);
    if(el.length != 1) return null;
    player.bonustile = codeNameToTile(el[0]);

    d = decomposeEqualsLine(lines[5]);
    if(d[0] != 'fav') return null;
    el = getCommas(d[1]);
    for(var i = 0; i < el.length; i++) {
      var t = getSpaces(el[i]);
      if(parseInt(t[1]) != 1) return null; //player can't have more than 1 per favor tile type
      player.favortiles[codeNameToTile(t[0])] = parseInt(t[1]);
    }

    d = decomposeEqualsLine(lines[6]);
    if(d[0] != 'tw') return null;
    el = getCommas(d[1]);
    for(var i = 0; i < el.length; i++) {
      var t = getSpaces(el[i]);
      player.towntiles[codeNameToTile(t[0])] = parseInt(t[1]);
    }

    d = decomposeEqualsLine(lines[7]);
    if(d[0] != 'oct') return null;
    el = getCommas(d[1]);
    for(var i = 0; i < el.length; i++) {
      var t = getSpaces(el[i]);
      player.octogons[codeNameToAction(t[0])] = 1;
    }

    d = decomposeEqualsLine(lines[8]);
    if(d[0] != 'cult') return null;
    el = getCommas(d[1]);
    if(el.length != 5) return null;
    player.cult[0] = parseInt(el[0]);
    player.cult[1] = parseInt(el[1]);
    player.cult[2] = parseInt(el[2]);
    player.cult[3] = parseInt(el[3]);
    player.keys = parseInt(el[4]);

    d = decomposeEqualsLine(lines[9]);
    if(d[0] != 'adv') return null;
    el = getCommas(d[1]);
    if(el.length != 2) return null;
    player.shipping = parseInt(el[0]);
    player.digging = parseInt(el[1]);

    d = decomposeEqualsLine(lines[10]);
    if(d[0] != 'vpreason') return null;
    el = getCommas(d[1]);
    for(var i = 0; i < el.length; i++) {
      var t = getSpaces(el[i]);
      player.vp_reason[t[0]] = parseInt(t[1]);
    }

    d = decomposeEqualsLine(lines[11]);
    if(d[0] != 'vpdetail') return null;
    el = getCommas(d[1]);
    for(var i = 0; i < el.length; i++) {
      var t = getSpaces(el[i]);
      if(t.length > 1) {
        var name = '';
        for(var j = 0; j < t.length - 1; j++) {
          if(j > 0) name += ' ';
          name += t[j];
        }
        player.vp_detail[name] = parseInt(t[t.length - 1]);
      }
    }

    // values deduced from the rest:
    player.tunnelcarpetdistance = 0;
    if(player.faction == F_DWARVES) {
      player.tunnelcarpetdistance = 1;
    }
    if(player.faction == F_FAKIRS) {
      player.tunnelcarpetdistance = 1;
      if(built_sh(player)) player.tunnelcarpetdistance++;
      if(player.towntiles[T_TW_4VP_SHIP]) player.tunnelcarpetdistance += player.towntiles[T_TW_4VP_SHIP];
    }
    player.bonusshipping = player.bonustile == T_BON_3PW_SHIP ? 1 : 0;

    index++;
  }

  var logPos = text.indexOf('log:');
  if(logPos > 0) {
    logPos += 4;
    var lines = getLines(text.substring(logPos));
    result.logText = '';
    for(var i = 0; i < lines.length; i++) result.logText += lines[i] + '<br/>';
  }


  return result;
}

//The format before new town tiles were introduced. I had accidently made that format not compatible with any game upgrades. The new format should be future proof.
//TODO: remove this - the old format is very old so mostly gone.
function deSerializeGameStateLegacyFormat(text) {
  var result = '';
  var comma = false;

  var legacycolors = {'n':'N', 'R':'R', 'Y':'Y', 'O':'U', 'K':'K', 'B':'B', 'G':'G', 'E':'S', 'i':'I'};
  // The order (index) of the array is legacy, the contents are the index converted to the current value.
  var legacyfactions = [F_NONE, F_NONE /*F_GENERIC*/, 0, F_CHAOS, F_GIANTS,
      F_FAKIRS, F_NOMADS, F_HALFLINGS, F_CULTISTS, F_ALCHEMISTS, F_DARKLINGS,
      F_MERMAIDS, F_SWARMLINGS, F_AUREN, F_WITCHES, F_ENGINEERS, F_DWARVES];
  // without the new bonus tiles etc..., these make the numbers differ from the old format
  var legacytilesorig = [
      T_NONE, 0, 0, T_BON_SPADE_2C/*3*/, T_BON_CULT_4C, T_BON_6C, T_BON_3PW_SHIP,
      T_BON_3PW_1W, T_BON_PASSDVP_2C, T_BON_PASSTPVP_1W, T_BON_PASSSHSAVP_2W,
      T_BON_1P /*11*/, 0, 0, T_FAV_3F/*14*/, T_FAV_3W, T_FAV_3E, T_FAV_3A,
      T_FAV_2F_6TW, T_FAV_2W_CULT, T_FAV_2E_1PW1W, T_FAV_2A_4PW, T_FAV_1F_3C,
      T_FAV_1W_TPVP, T_FAV_1E_DVP, T_FAV_1A_PASSTPVP /*25*/, 0, 0,
      T_TW_5VP_6C /*28*/, T_TW_6VP_8PW, T_TW_7VP_2W, T_TW_8VP_CULT, T_TW_9VP_P /*32*/,
      0, 0, T_ROUND_DIG2VP_1E1C /*35*/, T_ROUND_TW5VP_4E1DIG, T_ROUND_D2VP_4W1P,
      T_ROUND_SHSA5VP_2F1W, T_ROUND_D2VP_4F4PW, T_ROUND_TP3VP_4W1DIG,
      T_ROUND_SHSA5VP_2A1W, T_ROUND_TP3VP_4A1DIG /*42*/, 0 ];
  // This is how they were after the promo
  var legacytilespromo = legacytilesorig.slice(0); // The last TW now is 35 instead of 32, and ROUND now goes from 38 to 45.
  legacytilespromo.splice(28, 0, T_TW_2VP_2CULT);
  legacytilespromo.splice(29, 0, T_TW_4VP_SHIP);
  legacytilespromo.splice(35, 0, T_TW_11VP);
  var legacyoctogons = [A_NONE, 0, A_POWER_BRIDGE, A_POWER_1P, A_POWER_2W, A_POWER_7C,
      A_POWER_SPADE, A_POWER_2SPADE, A_BONUS_SPADE, A_BONUS_CULT, A_FAVOR_CULT, 0,
      A_DOUBLE, A_GIANTS_2SPADE, A_SANDSTORM, A_SWARMLINGS_TP,
      A_AUREN_CULT, A_WITCHES_D, 0, 0 ];
  var legacyvp = ['start', 'round', 'bonus', 'town', 'favor', 'advance', 'faction',
                  'leech', 'fire', 'water', 'earth', 'air', 'network', 'resources', 'other' ];
  var legacystate = [S_PRE, S_INIT_FACTION, S_INIT_DWELLING, S_INIT_BONUS, S_ACTION, S_LEECH, S_CULTISTS, S_ROUND_END_DIG, S_GAME_OVER];

  var s;
  var d;
  var lines; //lines of a section
  var el; //split line

  s = parseLabelPart(text, 'size:');
  el = getCommas(s);
  if(el.length != 2) return null;
  // board width and height
  var bw = parseInt(el[0]);
  var bh = parseInt(el[1]);

  var copysection = function(label) {
    result += label + ':\n';
    result += parseLabelPart(text, label + ':');
  };

  result +='size:\n';
  result += parseLabelPart(text, 'size:');

  result +='\nlandscape:\n';
  var landscape = parseLabelPart(text, 'landscape:').
      replace(/n/g, 'N').replace(/i/g, 'I').replace(/O/g, 'U').replace(/E/g, 'S');
  result += landscape;

  result +='\nbuildings:\n';
  var buildings = parseLabelPart(text, 'buildings:').replace(/n/g, 'N');
  result += buildings;

  s = parseWorldString(text, 'bridges:');
  result += '\nbridges:\n';
  comma = false;
  if(!s || s.length < bw * bh) return null;
  for(var i = 0; i < bw * bh; i++) {
    if(s[i].length != 3) return null;
    for(var z = 0; z < 3; z++) {
      var b = legacycolors[s[i].charAt(z)];
      if(!!b && b != 'N') {
        var x = i % bw;
        var y = Math.floor(i / bw);
        var co = bridgeCo(x, y, [D_N, D_NE, D_SE][z], false);
        if (comma) result += ',';
        result += printCo(x, y) + printCo(co[0], co[1]) + b;
        comma = true;
      }
    }
  }
  result += '\n';

  s = parseLabelPart(text, 'cultpriests:');
  result += 'cultpriests:\n';
  el = getCommas(s);
  for(var i = 0; i < el.length; i++) result += colorCodeName[parseInt(el[i])] + (i == el.length - 1 ? '\n' : ',');

  s = parseLabelPart(text, 'tiles:');
  result += 'tiles:\n';
  lines = getNonEmptyLines(s);
  if(lines.length != 5) return null;
  var promo = getCommas(lines[3]).length > 5; //new town tiles promo 2013
  var legacytiles = promo ? legacytilespromo : legacytilesorig;
  result += 'bon=';
  var el1 = getCommas(lines[0]);
  var el2 = getCommas(lines[1]);
  comma = false;
  for(var i = 3; i <= 11; i++) {
    var a = parseInt(el1[i - 3]);
    var m = parseInt(el2[i - 3]);
    if(a > 0) {
      result += (comma ? ',' : '') + getTileCodeName(legacytiles[i]) + ' ' + m;
      comma = true;
    }
    if(i == 11) result += '\n';
  }

  result += 'fav=';
  el = getCommas(lines[2]);
  comma = false;
  for(var i = 14; i <= 25; i++) {
    var a = parseInt(el[i - 14]);
    if(a > 0) {
      result += (comma ? ',' : '') + getTileCodeName(legacytiles[i]) + ' ' + a;
      comma = true;
    }
    if(i == 25) result += '\n';
  }

  result += 'tw=';
  el = getCommas(lines[3]);
  comma = false;
  for(var i = 28; i <= (promo ? 35 : 32); i++) {
    var a = parseInt(el[i - 28]);
    if(a > 0) {
      result += (comma ? ',' : '') + getTileCodeName(legacytiles[i]) + ' ' + a;
      comma = true;
    }
    if(i == (promo ? 35 : 32)) result += '\n';
  }

  result += 'rnd=';
  el = getCommas(lines[4]);
  if(el.length != 6) return null;
  for(var i = 0; i < 6; i++) result += getTileCodeName(legacytiles[parseInt(el[i]) + (promo ? 38 : 35)]) + (i == el.length - 1 ? '\n' : ',');

  s = parseLabelPart(text, 'octogons:');
  result += 'oct=';
  el = getCommas(lines[0]);
  comma = false;
  for(var i = 1; i < 18 /*amount of legacy octogons + 1*/; i++) {
    var a = parseInt(el[i]);
    if(a > 0) {
      result += (comma ? ',' : '') + getActionCodeName(legacyoctogons[i + 1]);
      comma = true;
    }
    if(i == 17) result += '\n';
  }


  s = parseLabelPart(text, 'gamestate:');
  result += 'gamestate:\n';
  lines = getNonEmptyLines(s);
  if(lines.length != 2) return null;
  el = getCommas(lines[0]);
  result += 'state=' + getGameStateCodeName(legacystate[parseInt(el[0])]) + ',' + el[1] + ',' + el[2] + ',' + el[3] + '\n';
  /*var leecharrayend = lines[1].lastIndexOf(']');
  if(leecharrayend <= 0) return null;
  result.state.leecharray = decodeNestedArray(lines[1].substring(0, leecharrayend + 1));
  el = getCommas(lines[1].substring(leecharrayend + 2));*/
  //legacy leech array not supported for now
  result += 'leech=0,0';
  result += '\n';

  var index = 0;
  result.players = [];
  while(true) {
    s = parseLabelPart(text, 'player:', index);
    if(s == null) {
      if(index == 0) return null;
      else break;
    }
    result += 'player:\n';
    lines = getNonEmptyLines(s);
    if(lines.length != 10) return null;

    el = getCommas(lines[0]);
    if(el.length != 5) return null;
    result += 'bio=' + el[0] + ',' + (el[1] == 'true' ? 'human' : 'ai') + ',' +
        getFactionCodeName(legacyfactions[parseInt(el[2])]) + ',' +
    legacycolors[el[3]] + '\n';
    result += 'passed=' + el[4] + '\n';

    result += 'res=' + lines[1] + '\n';
    result += 'buildings=' + lines[2] + '\n';

    result += 'bon=' + getTileCodeName(legacytiles[parseInt(lines[3])]) + '\n';

    result += 'fav=';
    el = getCommas(lines[4]);
    comma = false;
    for(var i = 14; i <= 25; i++) {
      var a = parseInt(el[i - 14]);
      if(a > 0) {
        result += (comma ? ',' : '') + getTileCodeName(legacytiles[i]) + ' ' + a;
        comma = true;
      }
      if(i == 25) result += '\n';
    }

    result += 'tw=';
    el = getCommas(lines[5]);
    comma = false;
    for(var i = 28; i <= (promo ? 35 : 32); i++) {
      var a = parseInt(el[i - 28]);
      if(a > 0) {
        result += (comma ? ',' : '') + getTileCodeName(legacytiles[i]) + ' ' + a;
        comma = true;
      }
      if(i == (promo ? 35 : 32)) result += '\n';
    }

    result += 'oct=';
    el = getCommas(lines[6]);
    comma = false;
    for(var i = 1; i < 18 /*amount of legacy octogons + 1*/; i++) {
      var a = parseInt(el[i]);
      if(a > 0) {
        result += (comma ? ',' : '') + getActionCodeName(legacyoctogons[i + 1]);
        comma = true;
      }
      if(i == 17) result += '\n';
    }

    result += 'cult=' + lines[7] + '\n';

    el = getCommas(lines[8]);
    if(el.length != 5) return null;
    result += 'adv=' + el[0] + ',' + el[3] + '\n';

    el = getCommas(lines[9]);
    if(el.length != 15) return null;
    result += 'vpreason='
    for(var i = 0; i < el.length; i++) {
      if(i == 8) {
        n = parseInt(el[i]) + parseInt(el[i + 1]) + parseInt(el[i + 2]) + parseInt(el[i + 3]);
        result += 'cult' + ' ' + n + ',';
        i += 3;
      } else {
        result += legacyvp[i] + ' ' + el[i] + (i == el.length - 1 ? '\n' : ',');
      }
    }
    result += 'vpdetail='
    for(var i = 0; i < el.length; i++) result += legacyvp[i] + ' ' + el[i] + (i == el.length - 1 ? '\n' : ',');

    index++;
  }

  var logPos = text.indexOf('log:');
  if(logPos > 0) {
    result += text.substr(logPos);
  }

  return deSerializeGameStateNewFormat(result);
}

