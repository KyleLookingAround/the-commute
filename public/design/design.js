// The redesign directions page: draws each direction's mockups at a device's real size and scales them to fit. Static
// markup only: nothing here runs the game. Prices, names and descriptions are the game's own (12 October 2026).
(function () {
  'use strict';

  // ---------- the game's numbers, as a player a few minutes in sees them ----------
  var CASH = '£4,860', CLOCK = 'Day 1 · 08:12', COINS = true;
  // the first five minutes move the clock and the cash on: [cash, clock, coins on the map]
  var STEP_STATE = [['£3,000', 'Day 1 · 06:30', false], ['£3,124', 'Day 1 · 06:44', true], ['£3,412', 'Day 1 · 07:02', true], ['£3,412', 'Day 1 · 07:03', false], ['£4,860', 'Day 1 · 08:12', true]];
  var STATIONS = [
    { n: 'Stockport', mi: '0 mi', own: true, wait: 42 },
    { n: 'Heaton Chapel', mi: '1.75 mi', price: '£9,000', togo: '£4,140 to go', pct: 54 },
    { n: 'Levenshulme', mi: '3 mi', price: '£30,000' },
    { n: 'Ardwick', mi: '5 mi', price: '£45,000' },
    { n: 'Manchester Piccadilly', short: 'Piccadilly', mi: '6 mi', price: '£150,000' },
    { n: 'Davenport', mi: '1.25 mi south', short: 'Davenport', price: '£80,000' },
    { n: 'Woodsmoor', mi: '2 mi south', price: '£110,000' },
    { n: 'Hazel Grove', mi: '3 mi south', price: '£200,000' }
  ];
  var CARDS = [
    { n: 'Subway', p: '£2,000', stage: true, can: true, adds: 'The far side walks across, not round: 5 min off their walk', saves: '3 min less walk for about 1,000 homes', then: ['Platform 3', 'Lifts'] },
    { n: 'Booking hall', p: '£3,000', stage: true, can: true, adds: '90% of fares collected (82% at a halt)', then: ['Ticket barriers', 'Greggs'] },
    { n: 'Taxi rank on Station Road', p: '£1,200', stage: true, can: true, adds: 'Cabs take some who’d give up on the train: a cut of each fare' },
    { n: 'Kiosk', p: '£1,500', can: true, adds: '+£0.35 per boarding passenger' },
    { n: 'Canopy', p: '£2,500', can: true, adds: 'Waiting in the dry feels a quarter shorter', saves: 'Waits feel 4 min shorter for about 1,000 homes' },
    { n: 'Platform extension', p: '£5,000', togo: '£140 to go', pct: 97, adds: 'Platform holds 320 instead of 150' },
    { n: 'Multi-storey car park', p: '£18,000', stage: true, togo: '£13,140 to go', pct: 27, adds: 'Drivers from beyond a walk park and ride, while there are spaces: a charge a car' },
    { n: 'Stockport Interchange', p: '£50,000', stage: true, togo: '£45,140 to go', pct: 10, adds: 'The bus station by the viaduct: a quicker, covered change from the bus, and buses from further out' }
  ];
  var LINE = [
    { n: 'Extra unit 1 of 3', p: '£6,000', togo: '£1,140 to go', pct: 81, adds: 'One more train in service: shorter waits, more passengers', then: ['Extra unit 2 of 3'] },
    { n: 'Spare unit', p: '£8,000', togo: '£3,140 to go', pct: 61, adds: 'Stands by in Stockport’s sidings: a failed train is moving again in half the time' },
    { n: 'Longer trains 1 of 2', p: '£12,000', togo: '£7,140 to go', pct: 41, adds: '+2 cars per unit', then: ['Longer trains 2 of 2'] },
    { n: 'Faster timetable', p: '£20,000', togo: '£15,140 to go', pct: 24, adds: 'Line speed 75 → 90 mph and new signals: quicker rides, fewer signal failures' }
  ];
  var STATS = [['Waiting', '42'], ['Boarded', '1,318'], ['Revenue', '£2,964'], ['Gave up', '37']];
  // contract renewal, mocked from its brief: the numbers are placeholders until it lands
  var PERKS = [
    { b: 'Capital', items: [['Starting cash £5,000', '100 rep', 'own'], ['Starting cash £10,000', '250 rep', 'next'], ['Starting cash £20,000', '600 rep', 'later']] },
    { b: 'Works', items: [['Parts rise a quarter sooner', '150 rep', 'next'], ['Building 10% cheaper', '400 rep', 'later']] },
    { b: 'Reach', items: [['Reach +100 m', '120 rep', 'next'], ['Reach +200 m', '300 rep', 'later']] },
    { b: 'Rolling stock', items: [['A unit in the sidings', '200 rep', 'next'], ['A spare unit to start', '500 rep', 'later']] }
  ];

  var SIZES = {
    p320: { w: 320, h: 568, kind: 'phone', label: '320 × 568 portrait' },
    p390: { w: 390, h: 844, kind: 'phone', label: '390 × 844 portrait' },
    land: { w: 844, h: 390, kind: 'land', label: '844 × 390 landscape phone' },
    tab: { w: 768, h: 1024, kind: 'tab', label: '768 × 1024 tablet' },
    desk: { w: 1440, h: 900, kind: 'desk', label: '1440 × 900 desktop' }
  };

  // ---------- the directions: what the page says about each ----------
  var DIRS = {
    A: {
      name: 'A · Platform sheet', idea: 'One sheet rises over the map from the bottom: a peek with the strip at rest, half height for a station or the line, full for settings and the contract. On landscape, tablets and desktop the same sheet docks to the left as a side panel.',
      thumb: 'Everything you tap often lives in the bottom 40% of a phone: the strip, the cards, Buy and the speed. The map views sit on the right edge just above the sheet, in the thumb’s arc. Settings is top right, out of reach on purpose: it is rare. In landscape the side panel puts the cards under the left thumb and the map under the right.',
      one: 'Yes, in portrait. The sheet drags only by its handle and header, so a thumb sliding over the map moves the map, never the sheet. Picking a card sinks the sheet to its peek with a Buy bar, so preview and buy happen in one place.',
      access: 'Contrast: panels go solid (no see-through), locked text rises to 4.7:1 and borders to 3:1. Keyboard: Tab runs top bar, map views, sheet; Esc lowers the sheet a step; the handle is a button with Raise and Lower. Reduced motion: the sheet jumps between heights and the ghost appears without a rise.',
      cost: 'Medium, about $30. A sheet component with three heights and a side mode, today’s cards and strip restyled, settings and saves moved into one sheet, two check groups updated.'
    },
    B: {
      name: 'B · Tab bar', idea: 'The map is always full screen. A tab bar along the bottom opens Stations, Line and More (a Contract tab joins once it is offered), and a route diagram above it stands in for the strip. In landscape and on wide screens the tab bar becomes a rail down the left.',
      thumb: 'The tab bar and the route diagram are in the easiest zone of all, the very bottom. Panels open upwards from the tab bar, so their first cards are near the thumb, but a long list runs up into the stretch zone. Top bar holds cash, clock and speed.',
      one: 'Yes, with a stretch: the panel’s top half needs a shuffle of the hand. The tab bar costs 64 px of map at all times, and a picked card shrinks the panel to a bar above the tabs.',
      access: 'Contrast as A. Keyboard: the tabs are a tablist with arrow keys; 1–4 jump to tabs. Reduced motion: panels appear without sliding. Tab icons always carry a word, so nothing relies on an icon alone.',
      cost: 'Medium to large, about $40. A tab bar and rail, a route diagram drawn from the network data, panels re-homed as tab pages, More absorbing settings, saves and credits, three check groups updated.'
    },
    C: {
      name: 'C · Departure board rail', idea: 'A departure board of the line, a station per row, with the open station’s cards underneath. On tablets and desktop it is a rail down the right beside the map; on phones it is a drawer you open from a button at the bottom right.',
      thumb: 'On phones the drawer’s button is bottom right, under a right thumb, and the board’s rows are big targets. The drawer covers most of the map while open, so on a phone you are either looking at the map or at the board, rarely both. On desktop it is the roomiest: board and cards always in view.',
      one: 'Partly. Opening and buying are one-handed, but the board’s top rows are in the stretch zone on a 390 phone, and left-handers need the drawer mirrored (a setting). An edge swipe to open it would fight the map’s slide, so it opens only from its button.',
      access: 'Contrast as A, and the board’s mono figures are the easiest to scan. Keyboard: the board is a list with arrow keys and Enter to open a station. Reduced motion: the drawer appears without sliding.',
      cost: 'Medium, about $35. A drawer and rail, the departure board replacing the strip (moving around the map’s strip slider has to move onto it), cards restyled, two check groups updated.'
    }
  };

  // ---------- small parts ----------
  function ico(name) {
    var p = {
      gear: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
      pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
      track: '<path d="M8 3 6 21M16 3l2 18M6.7 8h10.6M6.2 13h11.6M5.6 18h12.8"/>',
      more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
      scroll: '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M9 9h7M9 13h7M9 17h4"/>',
      line: '<path d="M3 16c4 0 5-8 9-8s5 8 9 8"/><circle cx="3" cy="16" r="1.6"/><circle cx="21" cy="16" r="1.6"/>',
      clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
      board: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 9h8M6 12h12M6 15h6"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>'
    }[name];
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  }
  function speed() { return '<span class="seg"><b class="on">1×</b><b>3×</b><b>10×</b></span>'; }
  function meter(pct) { return '<i class="mt"><i style="width:' + pct + '%"></i></i>'; }
  function card(c, opt) {
    opt = opt || {};
    var sel = opt.sel ? ' sel' : '';
    return '<div class="uc' + (c.can ? ' can' : '') + sel + (opt.tile ? ' tile' : '') + '">' +
      '<div class="uc-h"><b>' + c.n + '</b><span class="pr">' + c.p + '</span></div>' +
      (c.stage && !opt.tile ? '<span class="tag">Next stage</span>' : '') +
      (opt.tile ? '' : '<p class="adds">' + c.adds + '</p>') +
      (c.saves && !opt.tile ? '<p class="sv">' + c.saves + '</p>' : '') +
      (c.then && !opt.tile && !opt.short ? '<p class="then"><span>Then</span> <i>' + c.then.join('</i><i>') + '</i></p>' : '') +
      '<div class="act">' + (c.can ? '<span class="buy">Buy</span>' : meter(c.pct) + '<span class="togo">' + c.togo + '</span>') + '</div></div>';
  }
  function cards(list, n, opt) { return list.slice(0, n).map(function (c, i) { return card(c, { sel: opt && opt.sel === i, tile: opt && opt.tile, short: opt && opt.short }); }).join(''); }
  function stats(list) { return '<div class="sts">' + list.map(function (s) { return '<div><small>' + s[0] + '</small><b>' + s[1] + '</b></div>'; }).join('') + '</div>'; }
  function chip(s, i, sel) {
    return '<div class="chp' + (s.own ? '' : ' fog') + (sel ? ' on' : '') + '"><small>' + s.mi + '</small><b>' + (s.short || s.n) + '</b>' +
      (s.own ? '<span>' + s.wait + ' waiting</span>' : '<span class="p">' + s.price + '</span>') + (s.togo ? meter(s.pct) : '') + '</div>';
  }
  function strip(sel) { return '<div class="strip">' + STATIONS.map(function (s, i) { return chip(s, i, i === (sel == null ? 0 : sel)); }).join('') + '</div>'; }
  // the map: a screenshot of the game, and what happens on it drawn over it (impacts show on the map, not as text)
  function map(kind, extra) {
    var bg = { stock: 'img/map-stockport.png', ghost: 'img/map-ghost.png', line: 'img/map-line.png' }[kind || 'stock'];
    var over = '';
    if (kind !== 'line') {
      over += '<span class="mp lbl" style="left:50%;top:44%">Stockport <b>42</b></span>';
      if (COINS) over += '<span class="mp coin" style="left:40%;top:52%">+£2.40</span><span class="mp coin c2" style="left:60%;top:56%">+£2.40</span>';
      over += '<span class="mp edge" style="left:50%;top:12%">▲ Heaton Chapel <b>£9,000</b></span>';
    } else {
      over += '<span class="mp lbl" style="left:33%;top:60%">Stockport <b>42</b></span><span class="mp lbl fog" style="left:47%;top:48%">Heaton Chapel <b>£9,000</b></span><span class="mp lbl fog" style="left:70%;top:31%">Piccadilly <b>£150,000</b></span>';
      over += '<span class="mp train" style="left:52%;top:44%"></span><span class="mp train" style="left:27%;top:66%"></span>';
    }
    if (kind === 'ghost') over = '<span class="mp lbl ghost" style="left:52%;top:36%">Booking hall</span>' + '<span class="mp edge" style="left:50%;top:10%">▲ Heaton Chapel <b>£9,000</b></span>';
    return '<div class="map" style="background-image:url(' + bg + ')"><div class="ov">' + over + (extra || '') + '</div></div>';
  }
  function settingsBody() {
    return '<section><h4>Sound</h4><div class="row"><span class="btn on">Sound on</span><span class="vol"><i style="width:60%"></i></span></div></section>' +
      '<section><h4>Graphics</h4><div class="row"><span class="seg2"><b class="on">High</b><b>Low</b></span></div><div class="row"><span class="btn on">Shadows</span><span class="btn">Fewer people</span><span class="btn on">Sharp</span></div><p class="note">Low is lighter on older phones.</p></section>' +
      '<section><h4>Weather</h4><div class="row"><span class="btn on">Rain and shine</span></div><p class="note">Fair weather keeps rain, fog and snow off the map. The game plays the same.</p></section>' +
      '<section><h4>Screen</h4><div class="row"><span class="btn">Full screen</span></div></section>' +
      '<section><h4>Your game</h4><div class="row"><span class="btn">Save to file</span><span class="btn">Load from file</span></div><div class="row"><span class="btn warn">Start over</span></div><p class="note">Progress saves on this device and catches up while you’re away. Ready to play offline.</p></section>' +
      '<section><h4>About</h4><p class="note">Map data © OpenStreetMap contributors · ONS · NaPTAN · Environment Agency. <u>Credits</u></p></section>';
  }
  function contractBody(compact) {
    var tree = PERKS.map(function (br) {
      // locked perks stay hidden: only what is owned and the next in each branch show, with its follower as a "Then" chip
      var shown = br.items.filter(function (p) { return p[2] !== 'later'; });
      var later = br.items.filter(function (p) { return p[2] === 'later'; })[0];
      return '<div class="br"><h5>' + br.b + '</h5>' + shown.map(function (p) {
        return '<div class="perk ' + p[2] + '"><b>' + p[0] + '</b><span>' + (p[2] === 'own' ? 'Yours' : p[1]) + '</span></div>';
      }).join('') + (later ? '<p class="then"><span>Then</span> <i>' + later[0] + '</i></p>' : '') + '</div>';
    }).join('');
    return '<div class="ct-top"><div class="plaque"><small>Contract</small><b>No. 1</b></div><div><p class="ct-h">Renew as contract 2</p><p class="note">Banks <b class="rep">1,240 reputation</b>. Spend it on perks that last.</p></div></div>' +
      (compact ? '' : '<div class="ct-cols"><div><h4>Lasts</h4><p class="note">Perks, milestones and the plaque at Stockport</p></div><div><h4>Starts again</h4><p class="note">Cash, stations, stages, homes grown, weather</p></div></div>') +
      '<div class="tree">' + tree + '</div>' +
      '<div class="ct-go"><span class="buy big">Renew the contract</span><span class="note">Tap twice. You can keep playing this run instead.</span></div>';
  }
  function linePanelBody(n, opt) {
    return '<p class="sub">1 unit · 2-car · 75 mph</p>' + (opt && opt.renew ? '<div class="renew"><b>Renew the contract</b><span>+1,240 reputation</span></div>' : '') + '<div class="ucs">' + cards(LINE, n, opt) + '</div><p class="built"><span>Built</span> <i>nothing yet</i></p>';
  }
  function stationPanelBody(n, opt) {
    return stats(STATS) + '<p class="hint">Tap a card to see it on the map.</p><div class="ucs">' + cards(CARDS, n, opt) + '</div>';
  }

  // ---------- Direction A: the platform sheet ----------
  function A(sz, screen, step) {
    var phone = sz.kind === 'phone', side = !phone; // landscape, tablet and desktop: the sheet docks to the side
    var short = sz.h < 600;
    var top = '<div class="a-top"><span class="pill cash">' + CASH + '</span><span class="pill">' + CLOCK + '</span><span class="sp"></span><span class="rb" aria-label="Settings">' + ico('gear') + '</span></div>';
    var views = '<div class="a-views"><span class="rb lbl2">' + ico('line') + '<small>Line</small></span><span class="rb lbl2">' + ico('clock') + '<small>Mins</small></span><span class="rb lbl2">' + ico('sun') + '<small>Light</small></span></div>';
    var head = function (title, sub, tab) {
      return '<div class="a-handle"><i></i></div><div class="a-head"><div><b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
        '<span class="tabs2"><b' + (tab === 's' ? ' class="on"' : '') + '>Station</b><b' + (tab === 'l' ? ' class="on"' : '') + '>Line</b></span></div>';
    };
    var peek = '<div class="a-handle"><i></i></div><div class="a-peek"><div><b>Stockport</b><small>42 waiting · ' + CASH + '</small></div>' + speed() + '</div>' + strip(0);
    var sheet = '', state = 'peek', mapKind = 'stock', scrim = false;
    var nCards = short ? 2 : 4;
    if (screen === 'stage' || screen === 'strip') { sheet = peek; state = 'peek'; }
    if (screen === 'strip') { sheet = peek + '<p class="a-note">Drag along the strip to glide down the line; tap a station to open it.</p>'; }
    if (screen === 'station') { sheet = head('Stockport', '0 mi · 42 waiting', 's') + stationPanelBody(side ? 6 : nCards); state = 'half'; }
    if (screen === 'line') { sheet = head('The line', '', 'l') + linePanelBody(side ? 4 : (short ? 2 : 3)); state = 'half'; mapKind = 'line'; }
    if (screen === 'settings') { sheet = '<div class="a-handle"><i></i></div><div class="a-head"><b>Settings</b><span class="rb">' + ico('close') + '</span></div><div class="set">' + settingsBody() + '</div>'; state = 'full'; scrim = true; }
    if (screen === 'contract') { sheet = '<div class="a-handle"><i></i></div><div class="a-head"><b>The contract</b><span class="rb">' + ico('close') + '</span></div><div class="ct">' + contractBody(short) + '</div>'; state = 'full'; scrim = true; }
    if (screen === 'first5') {
      if (step === 0) { sheet = peek; }
      if (step === 1) { sheet = peek; }
      if (step === 2) { sheet = head('Stockport', '0 mi · 42 waiting', 's') + stationPanelBody(side ? 5 : nCards); state = 'half'; }
      if (step === 3) { sheet = '<div class="a-handle"><i></i></div><div class="a-buybar"><div><b>Booking hall</b><small>90% of fares collected</small></div><span class="buy">Buy · £3,000</span></div>' + (short ? '' : strip(0)); state = 'peek'; mapKind = 'ghost'; }
      if (step === 4) { sheet = peek; }
    }
    var extra = '';
    if (screen === 'first5' && step === 0) extra = '<span class="mp hintb" style="left:50%;top:60%">The first train is due at Stockport</span>';
    if (screen === 'first5' && step === 4) extra = '<span class="mp edge pulse" style="left:50%;top:12%">▲ Heaton Chapel <b>£9,000</b></span>';
    return '<div class="dev A ' + sz.kind + (short ? ' short' : '') + '">' + map(mapKind, extra) + top + (state === 'peek' || side ? views : '') +
      (scrim ? '<div class="scrim"></div>' : '') + '<div class="a-sheet ' + state + '">' + sheet + '</div></div>';
  }

  // ---------- Direction B: the tab bar ----------
  function B(sz, screen, step) {
    var phone = sz.kind === 'phone', rail = !phone, short = sz.h < 600;
    var tabs = [['pin', 'Stations', 'stations'], ['track', 'Line', 'line'], ['line', 'Views', 'views'], ['more', 'More', 'more']];
    if (screen === 'contract') tabs.splice(2, 0, ['scroll', 'Contract', 'contract']);
    var active = { station: 'stations', line: 'line', settings: 'more', contract: 'contract', first5: step === 2 || step === 3 ? 'stations' : '' }[screen] || '';
    var bar = '<div class="b-tabs">' + tabs.map(function (t) { return '<span class="' + (t[2] === active ? 'on' : '') + '">' + ico(t[0]) + '<small>' + t[1] + '</small></span>'; }).join('') + '</div>';
    var top = '<div class="b-top"><span class="pill cash">' + CASH + '</span><span class="pill">' + CLOCK + '</span>' + speed() + '</div>';
    // the route diagram: the line as a line, owned stations filled, the rest fogged with their price
    var ribbon = '<div class="b-route"><div class="rt">' + STATIONS.slice(0, 5).map(function (s, i) {
      return '<span class="stn' + (s.own ? ' own' : '') + (i === 0 ? ' on' : '') + '"><i></i><b>' + (s.short || s.n) + '</b><small>' + (s.own ? s.wait + ' waiting' : s.price) + '</small></span>';
    }).join('') + '</div><span class="br-off">Hazel Grove line ▾</span></div>';
    var panel = '', mapKind = 'stock';
    var n = short ? 2 : 4;
    if (screen === 'station') panel = '<div class="b-ph"><b>Stockport</b><small>0 mi · 42 waiting</small></div>' + stats(STATS) + '<div class="ucs grid">' + cards(CARDS, rail ? 6 : (short ? 4 : 6), { tile: true }) + '</div>';
    if (screen === 'line') { panel = '<div class="b-ph"><b>The line</b></div>' + linePanelBody(rail ? 4 : n); mapKind = 'line'; }
    if (screen === 'settings') panel = '<div class="b-ph"><b>More</b></div><div class="set">' + settingsBody() + '</div>';
    if (screen === 'contract') panel = '<div class="b-ph"><b>The contract</b></div><div class="ct">' + contractBody(short) + '</div>';
    if (screen === 'first5' && step === 2) panel = '<div class="b-ph"><b>Stockport</b><small>0 mi · 42 waiting</small></div>' + stats(STATS) + '<p class="hint">Tap a card to see it on the map.</p><div class="ucs grid">' + cards(CARDS, short ? 2 : 4, { tile: true }) + '</div>';
    var mini = '';
    if (screen === 'first5' && step === 3) { mini = '<div class="b-mini"><div><b>Booking hall</b><small>90% of fares collected</small></div><span class="buy">Buy · £3,000</span></div>'; mapKind = 'ghost'; }
    var full = screen === 'settings' || screen === 'contract';
    var extra = '';
    if (screen === 'first5' && step === 0) extra = '<span class="mp hintb" style="left:50%;top:60%">The first train is due at Stockport</span>';
    if (screen === 'first5' && step === 4) extra = '<span class="mp edge pulse" style="left:50%;top:12%">▲ Heaton Chapel <b>£9,000</b></span>';
    var showRibbon = !panel || rail;
    return '<div class="dev B ' + sz.kind + (short ? ' short' : '') + (panel ? ' pan' : '') + '">' + map(mapKind, extra) + top + (showRibbon ? ribbon : '') + mini +
      (panel ? '<div class="b-panel' + (full ? ' full' : '') + '">' + panel + '</div>' : '') + bar + '</div>';
  }

  // ---------- Direction C: the departure board rail ----------
  function C(sz, screen, step) {
    var phone = sz.kind === 'phone', rail = sz.kind === 'tab' || sz.kind === 'desk' || sz.kind === 'land', short = sz.h < 600;
    var top = '<div class="c-top"><span class="pill cash">' + CASH + '</span><span class="pill">' + CLOCK + '</span>' + speed() + '<span class="sp"></span><span class="rb">' + ico('gear') + '</span></div>';
    var board = function (sel, rows) {
      return '<div class="c-board"><div class="c-bh"><span>Station</span><span>Waiting / price</span></div>' + STATIONS.slice(0, rows).map(function (s, i) {
        return '<div class="c-row' + (s.own ? '' : ' fog') + (i === sel ? ' on' : '') + '"><small>' + s.mi.replace(' south', ' S') + '</small><b>' + (s.short || s.n) + '</b><span>' + (s.own ? s.wait : s.price) + '</span></div>';
      }).join('') + '</div>';
    };
    var tabs = function (t) { return '<span class="tabs2"><b' + (t === 's' ? ' class="on"' : '') + '>Stations</b><b' + (t === 'l' ? ' class="on"' : '') + '>Line</b></span>' + (phone ? '<span class="rb">' + ico('close') + '</span>' : ''); };
    var body = '', open = false, mapKind = 'stock', modal = '';
    var rows = short ? 3 : (phone ? 5 : 8);
    if (screen === 'stage' && !rail) { body = ''; open = false; }
    if (screen === 'stage' && rail) screen = 'station';
    if (screen === 'strip') { body = '<div class="c-rh">' + tabs('s') + '</div>' + board(0, rail ? 8 : 8) + (phone ? '' : '<p class="a-note">Drag the board up and down to glide along the line; tap a row to open it.</p>'); open = true; }
    if (screen === 'station' || (screen === 'first5' && step === 2)) { body = '<div class="c-rh">' + tabs('s') + '</div>' + (rail ? board(0, short ? 2 : 4) : '') + '<div class="c-ph"><b>Stockport</b><small>0 mi · 42 waiting</small></div>' + stationPanelBody(short ? 2 : 4); open = true; }
    if (screen === 'line') { body = '<div class="c-rh">' + tabs('l') + '</div><div class="c-ph"><b>The line</b></div>' + linePanelBody(short ? 2 : 4); open = true; mapKind = 'line'; }
    if (screen === 'settings') { modal = '<div class="scrim"></div><div class="c-modal"><div class="a-head"><b>Settings</b><span class="rb">' + ico('close') + '</span></div><div class="set">' + settingsBody() + '</div></div>'; open = rail; body = '<div class="c-rh">' + tabs('s') + '</div>' + board(0, 8); }
    if (screen === 'contract') { modal = '<div class="scrim"></div><div class="c-modal wide"><div class="a-head"><b>The contract</b><span class="rb">' + ico('close') + '</span></div><div class="ct">' + contractBody(short) + '</div></div>'; open = rail; body = '<div class="c-rh">' + tabs('l') + '</div>' + board(4, 8); }
    if (screen === 'first5' && step !== 2) { body = '<div class="c-rh">' + tabs('s') + '</div>' + board(0, 8); open = rail; }
    var bbar = '';
    if (screen === 'first5' && step === 3) { mapKind = 'ghost'; bbar = '<div class="c-buybar"><div><b>Booking hall</b><small>90% of fares collected</small></div><span class="buy">Buy · £3,000</span></div>'; open = rail && false; }
    var handle = '<div class="c-open">' + ico('board') + '<span><b>Stockport</b><small>42 waiting</small></span></div>';
    var extra = '';
    if (screen === 'first5' && step === 0) extra = '<span class="mp hintb" style="left:50%;top:60%">The first train is due at Stockport</span>';
    if (screen === 'first5' && step === 4) extra = '<span class="mp edge pulse" style="left:50%;top:12%">▲ Heaton Chapel <b>£9,000</b></span>';
    return '<div class="dev C ' + sz.kind + (short ? ' short' : '') + (open ? ' open' : '') + '"><div class="c-mapwrap">' + map(mapKind, extra) + top + (!open && !bbar ? handle : '') + bbar + '</div>' +
      '<div class="c-rail">' + body + '</div>' + modal + '</div>';
  }

  var DRAW = { A: A, B: B, C: C };
  var STEPS = [
    ['0:00', 'Day 1, 06:30. The map opens on Stockport with the first train due. No panel, no wall of text: people walk onto the platform and a count rises over it.'],
    ['0:40', 'The train calls. Each fare pops off the platform as a coin and flies to the cash. That is the whole game in one picture: people, trains, fares.'],
    ['1:30', 'They tap Stockport (the peek, the board or the tab: the only thing that says “tap me”). Its cards rise. One hint line: tap a card to see it on the map. No card is singled out as the one to buy.'],
    ['2:30', 'They tap a card. Its ghost stands on the map where it would go, and a Buy bar waits at the thumb. Buying it raises the part into place on the map.'],
    ['4:30', 'Up the line, Heaton Chapel waits in the fog with its price. Its chip fills as fares come in: the next goal, shown, never told.']
  ];

  // ---------- the page ----------
  var state = { dir: 'A', screen: 'stage', size: 'p390' };
  var out = document.getElementById('out');
  function readHash() {
    var h = location.hash.replace('#', '').split('/');
    if (h[0] && (DIRS[h[0]] || h[0] === 'today' || h[0] === 'all')) state.dir = h[0];
    if (h[1]) state.screen = h[1];
    if (h[2] && (SIZES[h[2]] || h[2] === 'all')) state.size = h[2];
    if (state.dir === 'all' && innerWidth < 1100) state.dir = 'A';
  }
  function frame(html, sz, maxW, maxH, caption) {
    var k = Math.min(1, maxW / sz.w, maxH / sz.h);
    return '<figure class="fr"><div class="scaler" style="width:' + Math.round(sz.w * k) + 'px;height:' + Math.round(sz.h * k) + 'px">' +
      '<div class="inner" style="width:' + sz.w + 'px;height:' + sz.h + 'px;transform:scale(' + k + ')">' + html + '</div></div>' +
      '<figcaption>' + caption + '</figcaption></figure>';
  }
  function todayShot(sizeKey, screen) {
    var map = { p320: 'today-320.png', p390: 'today-390.png', land: 'today-landscape.png', tab: 'today-tablet.png', desk: 'today-desktop.png' };
    if (screen === 'settings' && (sizeKey === 'p390' || sizeKey === 'p320')) return 'today-390-settings.png';
    return map[sizeKey];
  }
  var TODAY = [
    'On a phone the panels sit below the map, so buying means scrolling the map away, and a card’s ghost appears where you can’t see it.',
    'The top bar and title take 180 px of a 390 phone before the map starts, and the map views sit top right, the hardest place for a thumb.',
    'The light slider holds the bottom left of the map, prime thumb space, for a look-around toy.',
    'Save, Load and Start over live at the foot of a long page, under a paragraph of rules.',
    'Locked station names are 3.6:1 against their card, under the 4.5:1 small text needs; borders are 1.4:1, so a card’s edge barely shows.',
    'Labels at 10 px (the stats’ and chips’ captions) are below a readable size on a phone.'
  ];
  function sizes() { return state.size === 'all' ? Object.keys(SIZES) : [state.size]; }
  function render() {
    document.querySelectorAll('[data-dir]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.dir === state.dir)); });
    document.querySelectorAll('[data-screen]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.screen === state.screen)); });
    document.querySelectorAll('[data-size]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.size === state.size)); });
    var dirs = state.dir === 'all' ? ['A', 'B', 'C'] : [state.dir];
    var colW = Math.min(out.clientWidth, 1400) / dirs.length - (dirs.length > 1 ? 16 : 0);
    if (dirs.length === 1 && innerWidth >= 1000) colW -= 444;
    var html = '<div class="cols c' + dirs.length + '">';
    dirs.forEach(function (d) {
      html += '<section class="col">';
      if (d === 'today') {
        html += '<div class="about"><h2>Today</h2><p class="idea">The game as it is on main, from <code>npm run shots</code>-style screenshots at 13:00. What the directions set out to fix:</p><ul class="find">' + TODAY.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
        html += '<div class="frames">';
        sizes().forEach(function (k) {
          var sz = SIZES[k], src = todayShot(k, state.screen), full = (k === 'p320' || k === 'p390') && state.screen !== 'settings';
          if (state.screen === 'contract' || state.screen === 'first5') { html += '<p class="none">' + (state.screen === 'contract' ? 'Contract renewal is being built now: no screen yet.' : 'Today a new player gets the page as it is: map, strip, then the panel below the fold.') + '</p>'; return; }
          var w = Math.min(sz.w, colW, state.size === 'all' ? 420 : 1100);
          html += '<figure class="fr shot' + (full ? ' tall' : '') + '"><img src="img/' + src + '" alt="The game today at ' + sz.label + '" style="width:' + Math.round(w) + 'px" loading="lazy"><figcaption>' + sz.label + (full ? ' · whole page' : '') + '</figcaption></figure>';
        });
        html += '</div></section>'; return;
      }
      var D = DIRS[d];
      html += '<div class="about"><h2>' + D.name + (d === 'A' ? ' <span class="badge">Recommended</span>' : '') + '</h2><p class="idea">' + D.idea + '</p>' +
        '<details' + (dirs.length === 1 ? ' open' : '') + '><summary>Thumb zones, one hand, access, cost</summary><dl>' +
        '<dt>Thumb zones</dt><dd>' + D.thumb + '</dd><dt>One-handed</dt><dd>' + D.one + '</dd><dt>Contrast, keyboard, reduced motion</dt><dd>' + D.access + '</dd><dt>To build</dt><dd>' + D.cost + '</dd></dl></details></div>';
      html += '<div class="frames' + (state.zones ? ' zones' : '') + '">';
      var maxH = state.size === 'all' ? 460 : (innerWidth < 700 ? Math.min(innerHeight * 0.78, 640) : 700);
      if (state.screen === 'first5') {
        sizes().forEach(function (k) {
          var sz = SIZES[k];
          html += '<div class="story"><p class="story-size">' + sz.label + '</p><div class="story-row">';
          STEPS.forEach(function (s, i) {
            var w = sz.kind === 'phone' ? Math.min(colW, 300) : Math.min(colW, 520);
            CASH = STEP_STATE[i][0]; CLOCK = STEP_STATE[i][1]; COINS = STEP_STATE[i][2];
            var drawn = DRAW[d](sz, 'first5', i);
            CASH = '£4,860'; CLOCK = 'Day 1 · 08:12'; COINS = true;
            html += '<div class="step">' + frame(drawn, sz, w, state.size === 'all' ? 360 : 560, '<b>' + s[0] + '</b> ' + s[1]) + '</div>';
          });
          html += '</div></div>';
        });
      } else {
        sizes().forEach(function (k) {
          var sz = SIZES[k];
          var w = state.size === 'all' ? Math.min(colW, sz.kind === 'phone' ? 260 : 560) : colW;
          html += frame(DRAW[d](sz, state.screen), sz, w, maxH, sz.label);
        });
      }
      html += '</div></section>';
    });
    out.innerHTML = html + '</div>';
    history.replaceState(null, '', '#' + state.dir + '/' + state.screen + '/' + state.size);
  }
  document.querySelector('.pick').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dir) state.dir = b.dataset.dir;
    if (b.dataset.screen) state.screen = b.dataset.screen;
    if (b.dataset.size) state.size = b.dataset.size;
    render();
  });
  document.getElementById('zones').addEventListener('change', function (e) { state.zones = e.target.checked; render(); });
  var t; addEventListener('resize', function () { clearTimeout(t); t = setTimeout(render, 150); });
  readHash(); render();
})();
