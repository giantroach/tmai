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

//Human controller and parts of the UI


var Human = function() {
};
inherit(Human, Actor);

//for the human player
var mapClickFun = null;
var tileClickFun = null;
var cultClickFun = null;

//enum for human action states. This is a sub-division of the main game-states for human UI only.
//By locking certain activities into certain states, ruining the game by overwriting the mapClickFun etc... with something different is prevented
var HS_MAIN = 1; //no state means you're choosing action sequence. Only here, the Execute button should be visible (if also gamestate is S_ACTION)
var HS_MAP = 2; //must click the map for something other than dig or normal build (e.g. upgrade, bridge endpoint, mermaids town tile, witches dwelling, ...)
var HS_DIG = 3; //must click the map for dig and/or build
var HS_CULT = 4; //must go on the cult track
var HS_BONUS_TILE = 5;
var HS_FAVOR_TILE = 6;
var HS_TOWN_TILE = 7;
var HS_PRIEST_COLOR = 8;
var HS_OTHER = 9; //custom dialog, ...

var last_helptext = ''; // used to provide more helpful text in the action area as well when having to click on map, otherwise it's kind of confusing

var humanstate = HS_MAIN;

var undoGameStates = []; //remember game state from last action
var undoIndex = 0;

function humanStateBusy() {
  return mapClickFun != null || tileClickFun != null || cultClickFun != null;
}

//Sets the game to wait for the human to click on something, e.g. click on the map to choose dig/build location.
//hstate: the HS state, e.g. HS_DIG
//helptext: text shown in the action area of the human
//fun: a callback called with the click result of the human. E.g. the tile coordinates in case of HS_MAP, color in case of HS_PRIEST_COLOR, ...
//NOTE: Typically your callback should call "clearHumanState()" at the end.
function setHumanState(hstate, helptext, fun) {
  if(humanStateBusy()) {
    throw new Error('should not set callback if one is already active');
  }
  humanstate = hstate;
  if(helptext) {
    setHelp(helptext);
    last_helptext = helptext;
  }
  if(hstate == HS_MAP || hstate == HS_DIG) mapClickFun = fun;
  else if(hstate == HS_BONUS_TILE || hstate == HS_FAVOR_TILE || hstate == HS_TOWN_TILE) tileClickFun = fun;
  else if(hstate == HS_CULT) cultClickFun = fun;
  else if(hstate == HS_PRIEST_COLOR) Human.chooseColorDialog(state.currentPlayer, fun);
  drawHud();
}

var onClearHumanState = []; //e.g. for queueHumanState

function clearHumanState() {
  humanstate = HS_MAIN;
  clearHelp();
  mapClickFun = null;
  tileClickFun = null;
  cultClickFun = null;
  if(game.players.length > 0) drawHud();
  // notify the clearHumanState listeners and clear onClearHumanState.
  var temp = onClearHumanState;
  onClearHumanState = [];
  for(var i = 0; i < temp.length; i++) temp[i]();
}

//necessary for those cases where multiple happenings requiring human states are triggered at once
//e.g. when forming town while using multi-spade dig action, where you need to pick town tile, then continue digging
//see setHumanState for documentation on the parameters
function queueHumanState(state, helptext, fun) {
  if(humanStateBusy()) {
    onClearHumanState.push(function() {
      setHumanState(state, helptext, fun);
    });
  }
  else setHumanState(state, helptext, fun);
}

var pactions = []; //your sequence of actions until you press "execute"

function prepareAction(action) {
  if(state.type != S_ACTION) {
    return; //not supposed to do actions while gamestate is in another state
  }

  var player = getCurrentPlayer();

  //burn power if needed, but only if this is the first action, otherwise it's possible that e.g. you actually do have enough power, like from mermaids water town formation
  if(isPowerOctogonAction(action.type) && pactions.length == 0) {
    var power = player.pw2;
    for(var i = 0; i < pactions.length; i++) {
      //ACTUALLY, there are also other things that alter power: mermaids town giving power tile, chaos double action, ...
      //BUT instead it already looks above that this is the first action, so in fact this is redundant. But left for in case it'd be made more advance. Then all power altering actions must be checked.
      if(pactions[i].type == A_BURN) power++;
    }
    var needed = player.getActionCost(action.type)[3];

    while(power < needed) {
      power++;
      pactions.push(new Action(A_BURN));
    }
  }

  //automatically add tunneling/carpet if needed
  if(player.faction == F_FAKIRS || player.faction == F_DWARVES) {
    if(isBuildDwellingAction(action) || isTransformAction(action.type)) {
      var hastunnel = false;
      for(var i = 0; i < pactions.length; i++) {
        if(pactions[i].type == A_TUNNEL || pactions[i].type == A_CARPET) {
          hastunnel = true;
        }
      }
      if(!hastunnel && onlyReachableThroughFactionSpecial(player, action.co[0], action.co[1])) {
        var a = new Action(player.faction == F_DWARVES ? A_TUNNEL : A_CARPET);
        a.co = action.co;
        pactions.push(a);
      }
    }
  }

  pactions.push(action);

  if(player.faction == F_DARKLINGS && action.type == A_UPGRADE_SH) {
    //take the conversions into account
    var testres = testConvertSequence(player, pactions);
    //don't include converting 3pw into workers as well: the AI can extend this action sequence afterwards if it wants to do that.
    var num = Math.min(3, testres[1] - 4);
    num = Math.min(num, player.pp - testres[2]);
    for(var i = 0; i < num; i++) pactions.push(new Action(A_CONVERT_1W_1P));
  }

  actionSeqEl.innerHTML = actionsToString(pactions);

  var cults = []; //for acolytes
  var cultincome = player.getFaction().getActionIncome(player, action.type)[R_FREECULT];
  var actionincome = player.getFaction().getActionIncome(player, action.type);

  // Recursive because multiple decisions may be required for a single action.
  function tryPrepareAction(action) {
    actionSeqEl.innerHTML = actionsToString(pactions);
    if(action.type == A_PASS && action.bontile == T_NONE && state.round != 6) {
      var fun = function(tile) {
        if(!isBonusTile(tile)) return;
        action.bontile = tile;
        clearHumanState();
        tryPrepareAction(action);
      };
      queueHumanState(HS_BONUS_TILE, 'choose a bonus tile for passing', fun);
    }
    else if(action.favtiles.length < actionGivesFavorTile(player, action)) {
      setHelp('choose a favor tile', true);
      var fun = function(tile) {
        if(!isFavorTile(tile)) return;
        action.favtiles.push(tile);
        clearHumanState();
        tryPrepareAction(action);
      };
      queueHumanState(HS_FAVOR_TILE, 'choose a favor tile', fun);
    }
    //town tiles MUST be checked after favor tiles! This because there is a favor tile that can turn the action into a town-creation action.
    else if(action.twtiles.length < actionCreatesTown(player, action, pactions)) {
      var fun = function(tile) {
        if(!isTownTile(tile)) return;
        action.twtiles.push(tile);
        updateWToPConversionAfterDarklingsSHTownTile(player, pactions);
        clearHumanState();
        tryPrepareAction(action);
      };
      queueHumanState(HS_TOWN_TILE, 'that will form a town! choose a town tile', fun);
    }
    else if(action.type == A_UPGRADE_SH && player.faction == F_HALFLINGS) {
      letClickMapForHalflingsStrongholdDigs();
    }
    //else if(action.cult == C_NONE && isTransformAction(action.type) && player.getFaction().getTransformActionCost(player, action.type, R)[R_CULT]) {
    else if(action.cult == C_NONE && isTransformAction(action.type) && player.getFaction().getTransformActionCost(player, action.type, R)[R_CULT]) {
      var fun = function(cult) {
        action.cult = cult;
        clearHumanState();
        tryPrepareAction(action);
      };
      queueHumanState(HS_CULT, 'choose cult track for pay with', fun);
    }
    else if(cultincome > cults.length) {
      var fun = function(cult) {
        cults.push(cult);
        clearHumanState();
        pactions.push(makeActionWithCult(A_ACOLYTES_CULT, cult));
        actionSeqEl.innerHTML = actionsToString(pactions);
        tryPrepareAction(action);
      };
      queueHumanState(HS_CULT, 'choose cult track to increase', fun);
    }
    else if(actionincome[R_BRIDGE]) {
      letClickMapForBridge(actionincome[R_BRIDGE]);
    }
    else if((action.type == A_POWER_1P || action.type == A_CONVERT_5PW_1P) && action.color == N && mayGetPriestAsColor(player)) {
      queueHumanState(HS_PRIEST_COLOR, Texts.priestUnlockText, function(color) {
        action.color = color;
        clearHumanState();
        tryPrepareAction(action);
      });
    }
  }

  tryPrepareAction(action);
}

function letClickMapForHalflingsStrongholdDigs() {
  digAndBuildFun(DBM_BUILD, 'click where to dig for halflings SH bonus')
}

// TODO: do this in tryPrepareAction instead
function letClickMapForBridge(num) {
  var remaining = num * 2;
  var cos = [];
  var clickFun = function(x, y) {
    clearHumanState();
    remaining--;
    cos.push([x,y]);
    if(remaining % 2 == 0) {
      var action = new Action(A_PLACE_BRIDGE);
      action.cos.push(cos[cos.length - 2]);
      action.cos.push(cos[cos.length - 1]);
      prepareAction(action);
    }

    if(remaining > 0) {
      var text = (remaining % 2 == 0 ? 'click bridge start point' : 'click bridge end point')
      queueHumanState(HS_MAP, text, clickFun);
    }
  };
  queueHumanState(HS_MAP, 'click bridge start point', clickFun);
}

function chooseActionColor(action) {
  var already = getNoShiftColors(getCurrentPlayer());
  var j = 0;
  var bg = makeSizedDiv(300, 100, 200, 350, popupElement);
  bg.style.backgroundColor = '#FFFFFF';
  bg.innerHTML = 'choose shift color';
  bg.style.border = '1px solid black';

  var clickFun = function(color) {
    clearHumanState();
    action.color = color;
    popupElement.innerHTML = '';
    prepareAction(action);
  };

  for(var i = CIRCLE_BEGIN; i <= CIRCLE_END; i++) {
    if(already[i]) continue;
    var el = makeLinkButton(305, 100 + (j + 1) * 16, getColorName(i), popupElement);
    el.onclick = bind(clickFun, i);;
    j++;
  }

  queueHumanState(HS_MAP, 'choose color', null);
}

function isHandlingActionInput() {
  return state.type == S_ACTION && humanstate == HS_MAIN && getCurrentPlayer().human && !showingNextButtonPanel;
}

var executeButtonFun_ = null;

var executeButtonFun = function() {
  if(executeButtonFun_) executeButtonFun_();
};

var executeButtonClearFun_ = null;

var executeButtonClearFun = function() {
  if(executeButtonClearFun_) executeButtonClearFun_();
};

function saveUndoState(undoGameState) {
  if(undoIndex + 1 < undoGameStates.length) undoGameStates.length = undoIndex + 1; //lose the redo states
  if(undoGameStates.length > 100) undoGameStates = undoGameStates.splice(50, 1); //ensure it doesn't grow too extreme
  undoGameStates.push(undoGameState);
  undoIndex = undoGameStates.length - 1;
}

Human.prototype.doAction = function(playerIndex, callback) {
  executeButtonFun_ = function() {
    var undoGameState = saveGameState(game, state, logText)
    actionSeqEl.innerHTML = '';
    var error = callback(playerIndex, pactions);
    pactions = [];
    if(error != '') {
      setHelp('Execute action error: ' + error);
    } else {
      executeButtonFun_ = null;
      executeButtonClearFun_ = null;
      hideAllUIs();
      saveUndoState(undoGameState);
    }
  };
  executeButtonClearFun_ = function() {
    pactions.pop();
    actionSeqEl.innerHTML = actionsToString(pactions);
  };
};


Human.prototype.chooseInitialBonusTile = function(playerIndex, callback) {
  var fun = function(tile) {
    var error = callback(playerIndex, tile);
    if(error == '') clearHumanState();
    else setHelp('invalid bonus tile, please try again');
  }
  queueHumanState(HS_BONUS_TILE, null, fun);
};


Human.prototype.chooseInitialFavorTile = function(playerIndex, callback) {
  var fun = function(tile) {
    var error = callback(playerIndex, tile);
    if(error == '') clearHumanState();
    else setHelp('invalid favor tile, please try again');
  }
  queueHumanState(HS_FAVOR_TILE, null, fun);
};

Human.prototype.chooseInitialDwelling = function(playerIndex, callback) {
  var fun = function(x, y) {
    undoGameState = saveGameState(game, state, undefined);
    var error = callback(playerIndex, [x, y]);
    if(error == '') {
      clearHumanState();
      saveUndoState(undoGameState);
    }
    else setHelp('could not place initial dwelling: ' + error + ' - Please try again');
  };
  queueHumanState(HS_MAP, null, fun);
};

Human.prototype.chooseFaction = function(playerIndex, callback) {
  var buttonClickFun = function(faction) {
    var error = callback(playerIndex, faction);
    if(error != '') setHelp('invalid faction: ' + error + ' - Please try again');
  };

  var bg = makeSizedDiv(ACTIONPANELX, ACTIONPANELY, ACTIONPANELW, ACTIONPANELH, popupElement);
  //bg.style.backgroundColor = 'rgba(255,255,255,0.85)'; //alpha does not work in IE
  bg.style.backgroundColor = '#FFFFFF';
  bg.innerHTML = 'choose faction';
  bg.style.border = '1px solid black';

  var factions = getPossibleFactionChoices();

  var xpos = ACTIONPANELX + 5;
  var ypos = ACTIONPANELY + 16;
  for(var i = 0; i <= factions.length; i++) {
    var el = makeLinkButton(xpos, ypos, getFactionName(factions[i]), popupElement);
    ypos += 16;
    if(ypos > (ACTIONPANELY + ACTIONPANELH - 16)) {
      xpos += 120;
      ypos = ACTIONPANELY + 15;
    }
    el.onclick = bind(buttonClickFun, factions[i]);
  }
};

// callback receives chosen color
Human.chooseColorDialog = function(playerIndex, callback) {
  var player = game.players[playerIndex];

  var bg;

  var buttonClickFun = function(color) {
    popupElement.removeChild(bg);
    callback(color);
  };

  var ispriestcolor = false;
  if(player.color == Z && player.colors[player.woodcolor - R]) ispriestcolor = true;

  var colors = [];
  for(var i = CIRCLE_BEGIN; i <= CIRCLE_END; i++) {
    if(!ispriestcolor && auxColorToPlayerMap[i] == undefined && colorToPlayerMap[i] == undefined) colors.push(i);
    if(ispriestcolor && !player.colors[i - R]) colors.push(i);
  }

  bg = makeSizedDiv(ACTIONPANELX, ACTIONPANELY, ACTIONPANELW, ACTIONPANELH, popupElement);
  bg.style.backgroundColor = '#FFFFFF';
  bg.innerHTML = ispriestcolor ? Texts.priestUnlockText : 'choose color';
  bg.style.border = '1px solid black';

  var yshift = ispriestcolor ? 32 : 16;
  for(var i = 0; i < colors.length; i++) {
    var el = makeLinkButton(5, i * 16 + yshift, getColorName(colors[i]), bg);
    el.onclick = bind(buttonClickFun, colors[i]);
  }
  if(ispriestcolor) {
    var el = makeLinkButton(5, colors.length * 16 + yshift, 'as priest', bg);
    el.onclick = bind(buttonClickFun, Z);
  }
};

Human.prototype.chooseAuxColor = function(playerIndex, callback) {
  Human.chooseColorDialog(playerIndex, function(color) {
    var error = callback(playerIndex, color);
    if(error != '') setHelp('invalid color: ' + error + ' - Please try again');
  });
};

var autoLeech = false;
var autoLeech1 = false;
var autoLeechNo = false;//for debug

var leechYesFun = null; //for shortcuts
var leechNoFun = null; //for shortcuts

Human.prototype.leechPower = function(playerIndex, fromPlayer, amount, vpcost, roundnum, already, still, callback) {
  var doAutoLeech = function() {
    // Let an AI do the decisions for you.
    newAI().leechPower(playerIndex, fromPlayer, amount, vpcost, roundnum, already, still, callback);
    return;
  }

  if(autoLeechNo) {
    callback(playerIndex, false);
    return;
  }

  if(autoLeech) {
    doAutoLeech();
    return;
  }

  if(autoLeech1 && amount <= 1 && game.players[fromPlayer].race != F_CULTISTS) {
    callback(playerIndex, true);
    return;
  }

  var j = 0;
  //drawHud();
  var bg = makeSizedDiv(ACTIONPANELX, ACTIONPANELY, ACTIONPANELW, ACTIONPANELH, popupElement);
  bg.style.backgroundColor = '#fff';
  bg.innerHTML = 'leech ' + amount + ' power from ' + getFullName(game.players[fromPlayer]) + '?';
  bg.style.border = '1px solid black';

  var yes = makeLinkButton(ACTIONPANELX + 5, ACTIONPANELY + 30, 'yes', popupElement);
  leechYesFun = function() {
    leechNoFun = null;
    leechYesFun = null;
    callback(playerIndex, true);
  }
  yes.onclick = leechYesFun;

  var no = makeLinkButton(ACTIONPANELX + 5, ACTIONPANELY + 55, 'no', popupElement);
  leechNoFun = function() {
    leechNoFun = null;
    leechYesFun = null;
    callback(playerIndex, false);
  }
  no.onclick = leechNoFun;

  if(amount <= 1) {
    var a = makeLinkButton(ACTIONPANELX + 5, ACTIONPANELY + 80, 'auto for 1', popupElement);
    a.title = 'automatically leech if it is 1 power and not from cultists';
    a.onclick = function() {
      autoLeech1 = true;
      leechNoFun = null;
      leechYesFun = null;
      callback(playerIndex, true);
    }
  }

  var a2 = makeLinkButton(ACTIONPANELX + 5, ACTIONPANELY + 128, 'auto "smart"', popupElement);
  a2.onclick = function() {
    a2.title = 'Automatically decide whether to accept or decline leeching based on amount and round number. Never see the leech question again this game!';
    autoLeech = true;
    leechNoFun = null;
    leechYesFun = null;
    doAutoLeech();
  }

  var a3 = makeLinkButton(ACTIONPANELX + 480, ACTIONPANELY + 128, 'never', popupElement);
  a3.style.color = '#eee';
  a3.onclick = function() {
    autoLeechNo = true;
    callback(playerIndex, false);
  }
};


//Similar to transformDirAction, except returns A_TRANSFORM_CW if the tile is already your color, for the human UI dig controls (not applicable to giants)
function humanTransformDirAction(player, fromcolor, tocolor) {
  var result = transformDirAction(player, fromcolor, tocolor);
  return result.length == 0 ? [A_TRANSFORM_CW] : result;
}

//Returns opposite direction of humanTransformDirAction (not applicable to giants)
function humanAntiTransformDirAction(player, fromcolor, tocolor) {
  var result = humanTransformDirAction(player, fromcolor, tocolor);
  var dir = result[0] == A_TRANSFORM_CW ? A_TRANSFORM_CCW : A_TRANSFORM_CW;
  for(var i = 0; i < result.length; i++) {
    result[i] = dir;
  }
  return result;
}

Human.prototype.doRoundBonusSpade = function(playerIndex, callback) {
  var player = game.players[playerIndex];
  var num = player.spades;
  if(num < 2 && player.faction == F_GIANTS) {
    callback(playerIndex, []);
    return;
  }

  var result = [];

  actionSeqEl.innerHTML = 'rounddig';

  var clickedmap = {};

  var currentNum = num;
  var done = 0;
  var fun = function(x, y) {
    var ckey = '' + x + ',' + y;
    clickedmap[ckey] = undef0(clickedmap[ckey]) + 1;
    if(currentNum <= 0) return;
    var type = A_NONE;
    if(player.faction == F_GIANTS) type = A_GIANTS_TRANSFORM;
    else if(digAndBuildMode == DBM_ONE) {
      var types = humanTransformDirAction(player, getWorld(x, y), player.getMainDigColor());
      var j = clickedmap[ckey] - 1;//num - currentNum;
      if(j >= types.length) j = types.length - 1;
      type = types[j]; //TODO: this is not FULLY correct. Fix this to always have the right types required for transformation in the right order.
    }
    else if(digAndBuildMode == DBM_ANTI) type = humanAntiTransformDirAction(player, getWorld(x, y), player.getMainDigColor())[0];
    result.push([type,x,y]);
    actionSeqEl.innerHTML = 'rounddig ';
    for(var i = 0; i < result.length; i++) {
      actionSeqEl.innerHTML += printCo(result[i][1], result[i][2]);
      if(i < result.length - 1) actionSeqEl.innerHTML += ', ';
    }
    currentNum--;
  };
  var prevDigAndBuildMode = digAndBuildMode
  digAndBuildMode = player.faction == F_GIANTS ? DBM_COLOR : DBM_ONE;
  queueHumanState(HS_DIG, 'You got ' + num + '  bonus spades from the cult track. Click on map to dig, press execute when done.', fun);

  executeButtonFun_ = function() {
    var error = callback(playerIndex, result);
    if(error != '') {
      setHelp('Round bonus spade error: ' + error);
      result = [];
      actionSeqEl.innerHTML = 'rounddig';
      currentNum = num;
    } else {
      digAndBuildMode = prevDigAndBuildMode;
      clearHumanState();
      executeButtonFun_ = null;
      executeButtonClearFun_ = null;
      actionSeqEl.innerHTML = '';
      hideAllUIs();
    }
  };

  executeButtonClearFun_ = function() {
    result.pop();
    actionSeqEl.innerHTML = 'rounddig ' + printCos(result);
  };
};

Human.prototype.chooseShapeshiftersConversion = function(playerIndex, callback) {
  var fun = function(yes) {
    var error = callback(playerIndex, yes);
    clearHumanState();
  };
  Human.chooseShapeshiftersConversionDialog(playerIndex, callback);
  queueHumanState(HS_OTHER, 'convert 1vp to power token?', fun);
};

Human.chooseShapeshiftersConversionDialog = function(playerIndex, callback) {
  var player = game.players[playerIndex];

  var bg;

  var buttonClickFun = function(yes) {
    popupElement.removeChild(bg);
    clearHumanState();
    callback(playerIndex, yes);
  };

  bg = makeSizedDiv(ACTIONPANELX, ACTIONPANELY, ACTIONPANELW, ACTIONPANELH, popupElement);
  bg.style.backgroundColor = '#FFFFFF';
  bg.innerHTML = 'convert 1vp to power token?';
  bg.style.border = '1px solid black';

  makeLinkButton(5, 1 * 16, 'yes', bg).onclick = bind(buttonClickFun, true);
  makeLinkButton(5, 2 * 16, 'no', bg).onclick = bind(buttonClickFun, false);
};

Human.prototype.chooseCultistTrack = function(playerIndex, callback) {
  var fun = function(cult) {
    var error = callback(playerIndex, cult);
    if(error == '') clearHumanState();
    else {
      setHelp('invalid cult. Please try again');
    }
  };
  queueHumanState(HS_CULT, 'click on which cult track to increase', fun);
};

//dig&build mode
var DBM_BUILD = 0; //dig to your color if needed (as DBM_COLOR), and put a dwelling on it
var DBM_COLOR = 1; //dig all the way to your color (either with as much spades as needed, or sandstorm, or giants)
var DBM_ONE = 2; //dig once in your direction (or clockwise if it's your color)
var DBM_ANTI = 3; //dig once in opposite direction (or counterclockwise if it's your color)

var digAndBuildMode = DBM_BUILD;


function getFreeSpades(player, actions) {
  var result = 0;
  for(var i = 0; i < actions.length; i++) {
    result += spadesDifference(player, actions[i]);
  }
  return result;
}

//If this is called after e.g. a power dig or bonus dig or so, that action must already have been edded.
//This function will add extra A_SPADE actions if needed (to bring a full terrain to your color).
//If it's about round bonus spades, then not of course.
function digAndBuildFun(initialMode, helpText) {
  var player = getCurrentPlayer();

  digAndBuildMode = initialMode;

  var ptype = pactions.length > 0 ? pactions[pactions.length - 1].type : A_NONE; //previous action type
  var roundend = state.type == S_ROUND_END_DIG;
  var halflingssh = (ptype == A_UPGRADE_SH && player.faction == F_HALFLINGS);
  var cansplit = ptype == A_POWER_2SPADE || halflingssh;
  var canaddspades = !roundend && ptype != A_SANDSTORM && ptype != A_TRANSFORM_SPECIAL2 && !halflingssh;

  var fun = function(x, y) {
    clearHumanState();
    if(digAndBuildMode == DBM_BUILD || digAndBuildMode == DBM_COLOR) {
      if(ptype == A_SANDSTORM) {
        pactions[pactions.length - 1].co = [x, y];
      } else {
        var tactions = getAutoTransformActions(player, x, y, player.getMainDigColor(), getFreeSpades(player, pactions), 999);
        for(var i = 0; i < tactions.length; i++) prepareAction(tactions[i]);
      }
      if(digAndBuildMode == DBM_BUILD) {
        var action = new Action(A_BUILD);
        action.co = [x, y];
        prepareAction(action);
      }
    } else {
      // single dig where player chooses particular direction (e.g. anti-dig)
      var type = A_NONE;
      if(player.faction == F_GIANTS) type = A_GIANTS_TRANSFORM;
      else if(digAndBuildMode == DBM_ONE) type = humanTransformDirAction(player, getWorld(x, y), player.getMainDigColor())[0];
      else if(digAndBuildMode == DBM_ANTI) type = humanAntiTransformDirAction(player, getWorld(x, y), player.getMainDigColor())[0];
      if(getFreeSpades(player, pactions) < 1) prepareAction(new Action(A_SPADE));
      var action = new Action(type);
      action.co = [x, y];
      prepareAction(action);
    }

    if(getFreeSpades(player, pactions) > 0) {
      if(digAndBuildMode != DBM_ANTI) digAndBuildMode = DBM_ONE;
      queueHumanState(HS_DIG, helpText, fun);
      drawHud();
    }
  }

  queueHumanState(HS_DIG, helpText, fun);
}

//Gets the building at the x, y coordinate, but in case of chaos magicians
//double action, takes into account that this building may be built or upgraded
//from a previous action even though it's not on the map yet.
function getBuildingForUpgradeClick(x, y) {
  var b = getBuilding(x, y)[0];
  for(var i = 0; i < pactions.length; i++) {
    var action = pactions[i];
    if(action.co && action.co[0] == x && action.co[1] == y) {
      if(action.type == A_BUILD || action.type == A_WITCHES_D) b = B_D;
      else if(action.type == A_UPGRADE_TP || action.type == A_SWARMLINGS_TP) b = B_TP;
      else if(action.type == A_UPGRADE_TE) b = B_TE;
      else if(action.type == A_UPGRADE_SH) b = B_SH;
      else if(action.type == A_UPGRADE_SA) b = B_SA;
    }
  }
  return b;
}

function upgrade1fun() {
  var fun = function(x, y) {
    clearHumanState();
    //Commented out because e.g. chaos magician double action may have turned it to your color before, this just doesn't detect that yet
    //var tile = getWorld(x, y);
    //if(tile != getCurrentPlayer().color) return;
    var b = getBuildingForUpgradeClick(x, y);
    var action = new Action(A_NONE);
    if(b == B_D) action.type = A_UPGRADE_TP;
    else if(b == B_TP) action.type = A_UPGRADE_SH;
    else return;
    action.co = [x, y];
    prepareAction(action);
  };
  queueHumanState(HS_MAP, 'click where to upgrade to TP/SH', fun);
}

function upgrade2fun() {
  var fun = function(x, y) {
    clearHumanState();
    //Commented out because e.g. chaos magician double action may have turned it to your color before, this just doesn't detect that yet
    //var tile = getWorld(x, y);
    //if(tile != getCurrentPlayer().color) return;
    var b = getBuildingForUpgradeClick(x, y);
    var action = new Action(A_NONE);
    if(b == B_TP) action.type = A_UPGRADE_TE;
    else if(b == B_TE) action.type = A_UPGRADE_SA;
    else return;
    action.co = [x, y];
    prepareAction(action);
  };
  queueHumanState(HS_MAP, 'click where to upgrade to TE/SA', fun);
}

registerKeyHandler(88 /*X*/, function() {
  if(humanStateBusy()) return; // do not let this shortcut work if human must click something (map, cult track, ...). Note however that this misses the case of end round bonus dig, where execute button is visible. TODO: use better criterium so that bonus dig support 'x' shortcut too.
  executeButtonFun();
});
registerKeyHandler(13 /*enter*/, executeButtonFun);
registerKeyHandler(66 /*B*/, function() {
  if(isHandlingActionInput()) digAndBuildFun(DBM_BUILD, 'click where to dig&build');
});
registerKeyHandler(78 /*N*/, function() {
  if(nextButtonFun) nextButtonFun();
  else if(leechNoFun) leechNoFun();
});
registerKeyHandler(89 /*Y*/, function() {
  if(leechYesFun) leechYesFun();
});
registerKeyHandler(70 /*F*/, function() {
  if(fastButtonFun) fastButtonFun();
});
registerKeyHandler(71 /*G*/, function() {
  if(fastestButtonFun) fastestButtonFun();
});
registerKeyHandler(85 /*U*/, function() {
  if(isHandlingActionInput()) upgrade1fun();
});
registerKeyHandler(86 /*V*/, function() {
  if(isHandlingActionInput()) upgrade2fun();
});
