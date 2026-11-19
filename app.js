/* Simulateur PV + batterie – Model SA, Moudon
   Simulation au quart d'heure sur la courbe de charge réelle (01.10.2025 → 30.09.2026).
   Pilotage de la batterie et financement repris de l'étude ; voir les bulles ⓘ. */
'use strict';
const D = window.DATA;
const DT = 0.25;
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
const GREY = '#8c8b86';
// Énergie réactive facturée (kvarh) par mois, factures Romande Energie oct. 2025 → sept. 2026 (sept. = sept. 2025)
const Q_KVARH = [132846,175180,127547,162847,153514,167765,149233,155092,147299,75265,65240,98495];
const MONTHS = ['oct. 25','nov. 25','déc. 25','janv. 26','févr. 26','mars 26','avr. 26','mai 26','juin 26','juil. 26','août 26','sept. 26'];

/* ---------------- Paramètres par défaut (fichiers) ---------------- */
const DEF_VAR = [
  {name:'V1 · RU + RUE', acKwc:1005.48, prodAc:906096, rueKwc:3195.29, prodRue:3534250, price:3171600,
   batOn:true, psOn:true, batKwh:514, batKw:250, batReduc:99336, acPrice:0.097, T:730, R:0.8, Rs:0.8},
  {name:'V2 · Tout en autoconsommation', acKwc:4200.77, prodAc:4576824, rueKwc:0, prodRue:0, price:3276600,
   batOn:true, psOn:true, batKwh:1000, batKw:500, batReduc:199024, acPrice:0.097, T:640, R:1, Rs:1},
  {name:'V3 · RU, moins de panneaux', acKwc:2912.07, prodAc:3114100, rueKwc:0, prodRue:0, price:2169500,
   batOn:true, psOn:true, batKwh:1000, batKw:500, batReduc:220222, acPrice:0.097, T:650, R:1, Rs:1},
];
const DEF_GLOB = {rev:0.0741, puiss:9.47, prixQ:0.0282, rueOn:true, rueRate:520, ru1:360, ru2:300, ru3:250,
  deg:0.0035, assur:0.003, maint:0.002, hyp:0.02, actu:0.02, fp:0, horizon:25, subYear:1,
  usable:0.88, eta:0.938, auto:true, gridChg:false, psScen:'real'};

const VAR_FIELDS = [
  ['sec','Installation'],
  ['acKwc','Puissance en autoconsommation (kWc)',2,'Panneaux raccordés derrière le compteur de l\'usine : ils alimentent d\'abord l\'usine, le surplus est revendu. Subvention RU.'],
  ['prodAc','Production de la partie autoconsommation (kWh/an)',0,'Production 1re année selon la simulation PVsyst de la variante (fichier de flux).'],
  ['rueKwc','Puissance en injection totale (kWc)',2,'Installation séparée, avec son propre compteur : toute la production est revendue, rien ne va à l\'usine. Subvention RUE.'],
  ['prodRue','Production de la partie injection totale (kWh/an)',0,'Production 1re année de l\'installation en injection totale (fichier de flux V1).'],
  ['price','Prix de l\'offre TTC (CHF)',0,'Prix clé en main à mettre dans l\'offre, batterie comprise (fichier vert).'],
  ['acPrice','Valeur du kWh autoconsommé (CHF/kWh)',4,'Prix évité pour chaque kWh qui n\'est plus acheté au réseau (fichiers de flux : 9.7 ct).'],
  ['sec','Batterie'],
  ['batKwh','Capacité (kWh)',0,'Capacité nominale. V1 : 2 × Sungrow PowerStack ST255CS de 257 kWh = 514 kWh ; V2 et V3 : Pylontech A1000-OMNI 1 MWh.'],
  ['batKw','Puissance de charge et décharge (kW)',0,'Puissance maximale que la batterie peut fournir ou absorber. V1 : 2 × 125 kW = 250 kW ; Pylontech : 500 kW.'],
  ['batReduc','Baisse du prix si pas de batterie (CHF TTC)',0,'Montant retiré du prix de l\'offre quand la batterie est désactivée : coût de la batterie du fichier vert avec la même marge que l\'offre (V3 : génie civil de la batterie compris).'],
  ['T','Seuil de pointe visé (kW)',0,'Au-dessus de ce soutirage, la batterie se décharge pour écrêter la pointe. Si une pointe plus haute passe quand même, le seuil remonte jusqu\'à la fin du mois. Utilisé si le réglage automatique est désactivé.'],
  ['R','Réserve pour les pointes, hiver oct.–mars (0 à 1)',2,'Part de la capacité gardée en semaine pour le peak shaving d\'octobre à mars. Au-dessus de cette réserve, la batterie couvre la consommation. 1 = la batterie ne sert qu\'aux pointes en semaine. La réserve est gardée aussi le week-end, sauf si l\'option ci-dessous est activée. Utilisé si le réglage automatique est désactivé.'],
  ['Rs','Réserve pour les pointes, été avr.–sept. (0 à 1)',2,'Même chose d\'avril à septembre. En été le surplus solaire recharge la batterie : une réserve plus basse permet de vider le reste la nuit pour l\'usine. Utilisé si le réglage automatique est désactivé.'],
  ['wkFree','Libérer la réserve le week-end',-1,'Activé : du vendredi 22h au dimanche 20h, la batterie se vide pour l\'usine. Désactivé (par défaut) : la réserve est gardée aussi le week-end. Sans recharge sur le réseau, c\'est plus rentable : la batterie reste pleine pour les pointes du lundi matin, le surplus solaire du week-end la remplit.'],
];
const GLOB_FIELDS = [
  ['sec','Tarifs'],
  ['rev','Prix de revente du surplus (CHF/kWh)',4,'Prix payé pour chaque kWh injecté au réseau (fichiers de flux : 7.41 ct).'],
  ['puiss','Tarif de puissance (CHF/kW/mois)',2,'Appliqué à la pointe de chaque mois. Factures Romande Energie 2026 : 7.65 + 1.82 = 9.47.'],
  ['prixQ','Énergie réactive excédentaire (CHF/kvarh)',4,'La franchise vaut 50 % des kWh soutirés : moins on soutire, plus le réactif dépasse. Prix des factures : 0.0282. Mettre 0 si le réactif est compensé.'],
  ['sec','Subventions'],
  ['rueOn','RUE accordée',-1,'Si non, l\'installation en injection totale reçoit le barème RU à la place de la RUE.'],
  ['rueRate','RUE (CHF/kWc)',0,'Rétribution unique élevée pour l\'injection totale (fichier de flux V1 : 520 CHF/kWc, pas encore approuvée).'],
  ['ru1','RU jusqu\'à 30 kWc (CHF/kWc)',0,'Barème Pronovo des fichiers de flux.'],
  ['ru2','RU de 30 à 100 kWc (CHF/kWc)',0,'Barème Pronovo des fichiers de flux.'],
  ['ru3','RU au-delà de 100 kWc (CHF/kWc)',0,'Barème Pronovo des fichiers de flux.'],
  ['subYear','Année de versement des subventions',0,'1 = fin de la 1re année, comme dans les fichiers de flux.'],
  ['sec','Financement et charges'],
  ['fp','Fonds propres (CHF)',0,'Le reste est financé par hypothèque/leasing (fichiers de flux : 0).'],
  ['hyp','Taux hypothécaire',4,'Fichiers de flux : 2 %. Toutes les liquidités remboursent la dette en priorité.'],
  ['actu','Taux d\'actualisation',4,'Sert au gain net actualisé (fichiers de flux : 2 %).'],
  ['assur','Assurance (% du prix par an)',4,'Fichiers de flux : 0.3 %.'],
  ['maint','Réserve de maintenance (% du prix par an)',4,'Fichiers de flux : 0.2 %.'],
  ['deg','Vieillissement des panneaux (par an)',4,'Fichiers de flux : 0.35 %/an. Appliqué à la production et aux économies d\'énergie.'],
  ['horizon','Durée d\'analyse (ans)',0,'Nombre d\'années affichées et prises en compte.'],
  ['sec','Batterie (technique)'],
  ['usable','Capacité utile (part de la capacité)',2,'Capacité réellement utilisable en moyenne sur la durée de vie (profondeur de décharge et vieillissement).'],
  ['eta','Rendement de charge et de décharge',3,'Rendement dans chaque sens ; aller-retour ≈ 88 %.'],
  ['gridChg','Recharge de la batterie sur le réseau',-1,'Désactivé : la batterie se charge uniquement avec le surplus solaire de la partie autoconsommation, jamais sur le réseau. Activé : elle peut se recharger sur le réseau jusqu\'à sa réserve, quand l\'usine est bien sous le seuil de pointe.'],
  ['auto','Réglage automatique du pilotage',-1,'Cherche le seuil de pointe et la réserve les plus rentables, réglés sur janv.–sept. 2025 puis appliqués à l\'année simulée.'],
];

let V = JSON.parse(JSON.stringify(DEF_VAR));
let G = JSON.parse(JSON.stringify(DEF_GLOB));
// Scénarios de peak shaving : marge sous le seuil (kW), énergie en plus dans le quart d'heure, part du gain batterie comptée
const PS_SCEN = {
  theo: {t:'Théorique', m:0,  o:0,    k:1,   d:'Pilotage parfait : la batterie connaît la consommation moyenne de chaque quart d\'heure et coupe exactement au seuil.'},
  real: {t:'Réaliste',  m:30, o:0.15, k:1,   d:'Pilotage réel : la batterie vise 30 kW sous le seuil et dépense 15 % d\'énergie en plus, car elle réagit à la puissance instantanée qui varie dans le quart d\'heure.'},
  prud: {t:'Prudent',   m:50, o:0.25, k:0.7, d:'Marge de 50 kW, 25 % d\'énergie en plus, et seuls 70 % du gain de pointe dû à la batterie sont comptés, pour couvrir les écarts de météo et de consommation d\'une année à l\'autre.'}};
const scen = () => PS_SCEN[G.psScen] || PS_SCEN.real;
try { const s = JSON.parse(localStorage.getItem('moudon_state')); if (s && s.V && s.G) { V = s.V; G = Object.assign({}, DEF_GLOB, s.G); } } catch (e) {}
// Mise à jour des valeurs enregistrées dans le navigateur : batterie V1 = 2 × ST255CS (514 kWh / 250 kW)
if (V[0] && V[0].batKwh === 500 && V[0].batKw === 125){ V[0].batKwh = 514; V[0].batKw = 250; }
function save(){ try { localStorage.setItem('moudon_state', JSON.stringify({V, G})); } catch (e) {} }

/* ---------------- Préparation des séries ---------------- */
function series(start, n, load, pv, testYear){
  const t0 = Date.UTC(+start.slice(0,4), +start.slice(5,7)-1, +start.slice(8,10));
  const m = new Uint8Array(n), wk = new Uint8Array(n), su = new Uint8Array(n);
  for (let i = 0; i < n; i++){
    const d = new Date(t0 + i*900000), h = d.getUTCHours() + d.getUTCMinutes()/60, w = d.getUTCDay();
    m[i] = testYear ? (d.getUTCFullYear()-2025)*12 + d.getUTCMonth() - 9 : d.getUTCMonth();
    su[i] = (d.getUTCMonth() >= 3 && d.getUTCMonth() <= 8) ? 1 : 0; // été : avril à septembre
    wk[i] = ((w === 5 && h >= 22) || w === 6 || (w === 0 && h < 20)) ? 1 : 0;
  }
  return {n, t0, load: Float64Array.from(load), pv: Float64Array.from(pv, x => x/1e7), m, wk, su, nm: testYear ? 12 : 9};
}
const YEAR = series(D.start, D.n, D.load, D.pv, true);
const CAL = series(D.calStart, D.calN, D.calLoad, D.calPv, false);

/* ---------------- Simulation quart d'heure ---------------- */
let WKF = false; // réserve libérée le week-end (option par variante, désactivée par défaut)
function sim(S, prod, cap, pw, T0, R, eta, mode, keep){
  const Rw = Array.isArray(R) ? R[0] : R, Rs = Array.isArray(R) ? R[1] : R; // réserve hiver (oct.–mars) / été (avr.–sept.)
  // mode 0 : peak shaving + autoconsommation ; mode 1 : autoconsommation seule
  const n = S.n, nm = S.nm, SC = mode ? {m:0, o:0} : scen();
  const peak = new Float64Array(nm), imp = new Float64Array(nm);
  let soc = cap*0.5, T = mode ? Infinity : T0, cur = -1, exp = 0, dis = 0, chg = 0, gchg = 0;
  const grid = keep ? new Float32Array(n) : null, socA = keep ? new Float32Array(n) : null;
  const cA = keep ? new Float32Array(n) : null, dA = keep ? new Float32Array(n) : null, kA = keep ? new Uint8Array(n) : null, TA = keep ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++){
    if (S.m[i] !== cur){ cur = S.m[i]; T = mode ? Infinity : T0; }
    const x = S.load[i] - prod*S.pv[i];
    let c = 0, d = 0, kind = 0; // kind : 1 charge solaire, 2 charge réseau, 3 décharge pointe, 4 décharge autoconso
    if (keep) TA[i] = T;
    if (cap > 0){
      const res = ((S.wk[i] && WKF) || mode) ? 0 : (S.su[i] ? Rs : Rw)*cap;
      if (x < 0){ c = Math.min(-x, pw, (cap-soc)/(eta*DT)); kind = 1; }
      else if (x > T - SC.m){ d = Math.min((x-(T-SC.m))*(1+SC.o), pw, soc*eta/DT); kind = 3; }
      else if (soc > res){ d = Math.min(x, pw, (soc-res)*eta/DT); kind = 4; }
      else if (G.gridChg && soc < res && x < T-100){ c = Math.min(T-50-x, pw, (res-soc)/(eta*DT)); gchg += c*DT; kind = 2; }
      soc += c*eta*DT - d/eta*DT;
    }
    if (keep){ cA[i] = c; dA[i] = d; kA[i] = kind; }
    const y = x + c - d;
    if (y > 0){ imp[cur] += y*DT; if (y > peak[cur]) peak[cur] = y; if (y > T) T = y; }
    else exp -= y*DT;
    chg += c*DT; dis += d*DT;
    if (keep){ grid[i] = y; socA[i] = soc; }
  }
  return {peak, imp, exp, dis, chg, gchg, grid, soc: socA, ch: cA, dis15: dA, kind: kA, thr: TA};
}
function annualCost(r, ac, Q){
  let e = 0, p = 0, q = 0;
  for (let k = 0; k < r.imp.length; k++){ e += r.imp[k]*ac; p += r.peak[k]*G.puiss; if (Q) q += Math.max(Q[k]-0.5*r.imp[k], 0)*G.prixQ; }
  return e + p + q - r.exp*G.rev;
}
const Q_CAL = Q_KVARH.slice(3); // janv. → sept., même ordre que la période de réglage
const tuneCache = new Map();
function tune(prodPerKwh, cap, pw, ac){
  const key = [prodPerKwh, cap, pw, ac, WKF, G.puiss, G.rev, G.prixQ, G.eta, !!G.gridChg, G.psScen].join('|');
  if (tuneCache.has(key)) return tuneCache.get(key);
  const cost = (T, R) => annualCost(sim(CAL, prodPerKwh, cap, pw, T, R, G.eta, 0, false), ac, Q_CAL);
  // 1) seuil et réserve communs ; 2) réserve d'été séparée
  let best = null;
  for (let T = 520; T <= 960; T += 10) for (const R of [0.2,0.4,0.6,0.8,1]){
    const c = cost(T, R); if (!best || c < best.c) best = {c, T, R, Rs: R};
  }
  // Réserve d'été : abaissée seulement si le gain est net (> 100 CHF/an sur la période de réglage)
  let bs = best;
  for (const Rs of [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1]){ const c = cost(best.T, [best.R, Rs]); if (c < bs.c - 1e-6) bs = {c, T: best.T, R: best.R, Rs}; }
  if (best.c - bs.c > 100) best = bs;
  tuneCache.set(key, best); return best;
}

/* ---------------- Subventions ---------------- */
function ruAmount(p){ return p <= 0 ? 0 : G.ru1*Math.min(p,30) + G.ru2*Math.min(Math.max(p-30,0),70) + G.ru3*Math.max(p-100,0); }

/* ---------------- Calcul d'une variante ---------------- */
let BASE = null;
function compute(v){
  if (!BASE) BASE = sim(YEAR, 0, 0, 0, 1e9, 1, G.eta, 1, false);
  const hasBat = v.batOn && v.batKwh > 0;
  const cap = hasBat ? v.batKwh*G.usable : 0, pw = hasBat ? v.batKw : 0;
  let T = v.T, R = v.R, Rs = v.Rs ?? v.R;
  const mode = (hasBat && v.psOn) ? 0 : 1;
  WKF = v.wkFree === true;
  if (hasBat && v.psOn && G.auto){ const t = tune(v.prodAc, cap, pw, v.acPrice); T = t.T; R = t.R; Rs = t.Rs; }
  const r = sim(YEAR, v.prodAc, cap, pw, T, [R, Rs], G.eta, mode, true);
  const r0 = hasBat ? sim(YEAR, v.prodAc, 0, 0, 1e9, 1, G.eta, 1, false) : r;
  const sum = a => a.reduce((s,x)=>s+x, 0);
  const impB = sum(BASE.imp), imp = sum(r.imp);
  const qB = Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*BASE.imp[k],0),0), qV = Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*r.imp[k],0),0);
  const sEnergy = (impB - imp)*v.acPrice;
  const sPeak = ((sum(BASE.peak) - sum(r0.peak)) + (mode === 0 ? scen().k : 1)*(sum(r0.peak) - sum(r.peak)))*G.puiss;
  const sQ = -(qV - qB)*G.prixQ;
  const sExp = r.exp*G.rev;
  const sRue = v.prodRue*G.rev;
  const batPart = hasBat ? (sum(r0.peak) - sum(r.peak))*G.puiss + (sum(r0.imp)-imp)*v.acPrice + (r.exp-r0.exp)*G.rev
                   - (qV - Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*r0.imp[k],0),0))*G.prixQ : 0;
  const price = v.price - (v.batOn ? 0 : v.batReduc);
  const sub = ruAmount(v.acKwc) + (v.rueKwc > 0 ? ((G.rueOn && v.rueKwc >= 150) ? G.rueRate*v.rueKwc : ruAmount(v.rueKwc)) : 0) + (v.subCom || 0);
  const dep = (G.assur + G.maint)*price;
  // Flux annuels, logique des fichiers de flux Soleol
  const H = Math.max(1, Math.round(G.horizon));
  let debt = Math.max(price - G.fp, 0), cum = -Math.min(G.fp, price), npv = -price, payback = null;
  const rows = [];
  for (let n = 1; n <= H; n++){
    const f = Math.pow(1 - G.deg, n-1);
    const recettes = (sEnergy + sExp + sQ + sRue)*f + sPeak;
    const interet = G.hyp*debt;
    const subv = (n === Math.round(G.subYear)) ? sub : 0;
    const dispo = recettes - dep - interet + subv;
    const debtStart = debt;
    const remb = Math.max(Math.min(debt, dispo), 0);
    debt -= remb;
    const cf = dispo - remb;
    cum += cf;
    if (payback === null && debtStart > 0 && debt <= 1e-6){ payback = n - 1 + (dispo > 0 ? remb/dispo : 1); }
    npv += (recettes - dep)/Math.pow(1+G.actu, n) + subv/Math.pow(1+G.actu, n);
    rows.push({n, prod:(v.prodAc + v.prodRue)*f, recettes, dep, interet, subv, remb, debt, cf, cum});
  }
  if (payback === null && price - G.fp <= 0) payback = 0;
  const net = price - sub;
  const simple = net / ((sEnergy + sExp + sQ + sRue + sPeak) - dep);
  return {v, hasBat, mode, T, R, Rs, cap, r, price, sub, net, dep, sEnergy, sPeak, sQ, sExp, sRue, batPart,
    year1: sEnergy + sPeak + sQ + sExp + sRue, autoconso: v.prodAc - r.exp,
    tauxAc: v.prodAc > 0 ? (v.prodAc - r.exp)/v.prodAc : 0, tauxAc0: v.prodAc > 0 ? (v.prodAc - r0.exp)/v.prodAc : 0,
    couverture: (v.prodAc - r.exp)/(sum(BASE.imp)), tauxTot: (v.prodAc + v.prodRue) > 0 ? (v.prodAc - r.exp)/(v.prodAc + v.prodRue) : 0, surplus: r.exp, rueProd: v.prodRue,
    peakAvg: sum(r.peak)/12, peakMonths: Array.from(r.peak), peakPv: Array.from(r0.peak), impMonths: Array.from(r.imp), rows, npv, cum, payback, simple, cycles: cap ? r.dis/cap : 0};
}

/* ---------------- Formatage ---------------- */
const fCHF = x => (x < 0 ? '−' : '') + Math.round(Math.abs(x)).toLocaleString('fr-CH').replace(/ |\s/g, "'") ;
const fN = (x,d=0) => (x < 0 ? '−' : '') + Math.abs(x).toLocaleString('fr-CH',{minimumFractionDigits:d,maximumFractionDigits:d}).replace(/ |\s/g, "'");
const fM = x => fN(x/1e6, 2) + ' M';
const fY = x => x === null || !isFinite(x) ? '> durée' : fN(x,1) + ' ans';

/* ---------------- Graphiques ---------------- */
Chart.defaults.font.family = '"Helvetica Neue", Arial, sans-serif';
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#5d5c58';
const CH = {};
function chart(id, cfg){ if (CH[id]) { CH[id].data = cfg.data; CH[id].options = cfg.options; CH[id].update('none'); return; } CH[id] = new Chart(document.getElementById(id), cfg); }
const gridY = {grid:{color:'#ecebe6'}, ticks:{callback: v => fN(v, (Math.abs(v) < 10 && v % 1) ? 1 : 0)}};
const tipCHF = {callbacks:{label: c => `${c.dataset.label || c.label}: ${fN(c.parsed.y)} `}};

let RES = [];
function render(){
  RES = V.map(compute);
  renderCards(); renderComp(); renderFlux(); renderPS(); renderDetail(); renderAct(); renderBS();
  document.getElementById('status').textContent = 'Calcul à jour · ' + new Date().toLocaleTimeString('fr-CH',{hour:'2-digit',minute:'2-digit'});
}

function renderCards(){
  const el = document.getElementById('cards');
  el.innerHTML = RES.map((r,i) => `
   <div class="card" style="--c:${COLORS[i]}">
     <h2>${r.v.name}</h2>
     <div class="sub">${fN(r.v.acKwc,1)} kWc autoconso${r.v.rueKwc>0 ? ' + ' + fN(r.v.rueKwc,1)+' kWc injection totale' : ''} · batterie ${fN(r.v.batKwh)} kWh / ${fN(r.v.batKw)} kW</div>
     <div class="toggles">
       <label class="sw"><input type="checkbox" data-v="${i}" data-k="batOn" ${r.v.batOn?'checked':''}><span class="k"></span>Batterie</label>
       <label class="sw"><input type="checkbox" data-v="${i}" data-k="psOn" ${r.v.psOn?'checked':''} ${r.v.batOn?'':'disabled'}><span class="k"></span>Peak shaving</label>
       <i class="tip" data-tip="Batterie : retire la batterie de la variante et baisse le prix de l'offre. Peak shaving : si désactivé, la batterie sert seulement à stocker le surplus solaire ; la pointe reste facturée.">i</i>
     </div>
     <div class="kpis">
       <div class="kpi"><b>${fCHF(r.net)}</b><span>Investissement net (CHF)</span></div>
       <div class="kpi"><b>${fY(r.payback)}</b><span>Entièrement payé après</span></div>
       <div class="kpi"><b>${fCHF(r.year1)}</b><span>Gain 1re année (CHF)</span></div>
       <div class="kpi"><b>${fM(r.npv)}</b><span>Gain net actualisé (CHF)</span></div>
       <div class="kpi"><b>${fN(r.tauxAc*100,1)} %</b><span>Taux d'autoconsommation <i class="tip" data-tip="Part de la production de l'installation en autoconsommation utilisée par l'usine (directement ou via la batterie). Le reste est revendu. Calculé au quart d'heure sur la consommation réelle.">i</i></span></div>
       <div class="kpi"><b>${fN(r.couverture*100,1)} %</b><span>Consommation couverte <i class="tip" data-tip="Part de la consommation annuelle de l'usine couverte par le solaire (directement ou via la batterie).">i</i></span></div>
       <div class="kpi"><b>${fN(r.peakAvg)} kW</b><span>Pointe moyenne / mois</span></div>
       <div class="kpi"><b>${fM(r.cum)}</b><span>Liquidités à ${Math.round(G.horizon)} ans (CHF)</span></div>
     </div>
     ${r.hasBat && r.mode===0 ? `<div class="cap">Pilotage : seuil ${fN(r.T)} kW, réserve pointes hiver ${fN(r.R*r.cap)} kWh, été ${fN(r.Rs*r.cap)} kWh${G.auto?' (réglage automatique)':''}</div>` : ''}
   </div>`).join('');
  el.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = e => { V[+e.target.dataset.v][e.target.dataset.k] = e.target.checked; save(); schedule(); });
  bindTips(el);
}

function renderComp(){
  const H = Math.round(G.horizon);
  const best = RES.reduce((a,b,i)=> b.npv > RES[a].npv ? i : a, 0);
  const sorted = RES.map(r=>r.npv).sort((a,b)=>b-a);
  document.getElementById('best').textContent = `Meilleure variante sur le gain net actualisé : ${RES[best].v.name} · ${fCHF(sorted[0]-sorted[1])} CHF d'avance sur la 2e (${fN((sorted[0]-sorted[1])/Math.abs(sorted[0])*100,1)} %).`;
  const yrs = Array.from({length:H+1},(_,i)=>i);
  chart('chCum', {type:'line', data:{labels:yrs, datasets: RES.map((r,i)=>({label:r.v.name, data:[-Math.min(G.fp, r.price)].concat(r.rows.map(x=>x.cum)), borderColor:COLORS[i], backgroundColor:COLORS[i], borderWidth:2.5, pointRadius:0, tension:.1}))},
    options:{interaction:{mode:'index',intersect:false}, plugins:{tooltip:tipCHF, legend:{position:'bottom'}}, scales:{x:{title:{display:true,text:'Années'},grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF'}}}}});
  chart('chNpv', {type:'bar', data:{labels:RES.map(r=>r.v.name.split(' · ')[0]), datasets:[{label:'Gain net actualisé', data:RES.map(r=>r.npv), backgroundColor:COLORS, borderRadius:4}]},
    options:{plugins:{legend:{display:false}, tooltip:tipCHF}, scales:{x:{grid:{display:false}}, y:{...gridY, beginAtZero:true, title:{display:true,text:'CHF'}}}}});
  chart('chPeak', {type:'line', data:{labels:MONTHS, datasets:[{label:'Sans PV', data:Array.from(BASE.peak), borderColor:GREY, backgroundColor:GREY, borderDash:[5,4], borderWidth:2, pointRadius:2}].concat(RES.map((r,i)=>({label:r.v.name.split(' · ')[0], data:r.peakMonths, borderColor:COLORS[i], backgroundColor:COLORS[i], borderWidth:2, pointRadius:2})))},
    options:{interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:{grid:{display:false}}, y:{...gridY, title:{display:true,text:'kW'}}}}});
  chart('chEnergy', {type:'bar', data:{labels:RES.map(r=>r.v.name.split(' · ')[0]), datasets:[
      {label:'Autoconsommé', data:RES.map(r=>r.autoconso/1000), backgroundColor:'#2a78d6'},
      {label:'Surplus revendu', data:RES.map(r=>r.surplus/1000), backgroundColor:'#eda100'},
      {label:'Injection totale (RUE)', data:RES.map(r=>r.rueProd/1000), backgroundColor:'#1baf7a'}]},
    options:{plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fN(c.parsed.y)} MWh`}}}, scales:{x:{stacked:true, grid:{display:false}}, y:{stacked:true, ...gridY, title:{display:true,text:'MWh/an'}}}}});
  const L = [
    ['Prix de l\'offre TTC (CHF)', r=>fCHF(r.price)], ['Subventions RU + RUE (CHF)', r=>fCHF(r.sub)], ['Investissement net (CHF)', r=>fCHF(r.net), 1],
    ['Économie d\'énergie (CHF/an)', r=>fCHF(r.sEnergy)], ['Économie de puissance (CHF/an)', r=>fCHF(r.sPeak)], ['Énergie réactive (CHF/an)', r=>fCHF(r.sQ)],
    ['Revente du surplus (CHF/an)', r=>fCHF(r.sExp)], ['Revente injection totale (CHF/an)', r=>fCHF(r.sRue)], ['Gain 1re année (CHF)', r=>fCHF(r.year1), 1],
    ['dont apport de la batterie (CHF/an)', r=>r.hasBat?fCHF(r.batPart):'–'], ['Assurance + maintenance (CHF/an)', r=>fCHF(r.dep)],
    ['Retour simple (ans)', r=>fN(r.simple,1)], ['Entièrement payé après', r=>fY(r.payback), 1],
    [`Liquidités cumulées à ${H} ans (CHF)`, r=>fCHF(r.cum)], ['Gain net actualisé (CHF)', r=>fCHF(r.npv), 1],
    ['Production de la partie autoconsommation (MWh/an)', r=>fN(r.v.prodAc/1000)], ['Autoconsommé (MWh/an)', r=>fN(r.autoconso/1000)],
    ['Taux d\'autoconsommation, avec batterie', r=>fN(r.tauxAc*100,1)+' %', 1], ['Taux d\'autoconsommation, sans batterie', r=>fN(r.tauxAc0*100,1)+' %'],
    ['Taux d\'autoconsommation sur toute la production (RUE comprise)', r=>fN(r.tauxTot*100,1)+' %'], ['Consommation de l\'usine couverte par le solaire', r=>fN(r.couverture*100,1)+' %', 1], ['Surplus revendu (MWh/an)', r=>fN(r.surplus/1000)], ['Injection totale (MWh/an)', r=>fN(r.rueProd/1000)],
    ['Pointe moyenne (kW)', r=>fN(r.peakAvg)], ['Cycles de batterie par an', r=>r.hasBat?fN(r.cycles):'–']];
  document.getElementById('tblComp').innerHTML = '<thead><tr><th></th>' + RES.map((r,i)=>`<th style="color:${COLORS[i]}">${r.v.name}</th>`).join('') + '</tr></thead><tbody>' +
    L.map(([l,f,h]) => `<tr class="${h?'hl':''}"><td>${l}</td>${RES.map(r=>`<td>${f(r)}</td>`).join('')}</tr>`).join('') + '</tbody>';
}

let fluxIdx = 0, detIdx = 0;
function segs(id, cur, cb){
  const el = document.getElementById(id);
  el.innerHTML = V.map((v,i)=>`<button class="${i===cur?'on':''}" data-i="${i}">${v.name}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => cb(+b.dataset.i));
}
function renderFlux(){
  segs('fluxSel', fluxIdx, i => { fluxIdx = i; renderFlux(); });
  const r = RES[fluxIdx], c = COLORS[fluxIdx];
  const lab = r.rows.map(x=>x.n);
  chart('chCf', {type:'bar', data:{labels:lab, datasets:[{label:'Cash-flow annuel', data:r.rows.map(x=>x.cf), backgroundColor:c, borderRadius:3}]},
    options:{plugins:{legend:{display:false}, tooltip:tipCHF}, scales:{x:{title:{display:true,text:'Années'},grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF'}}}}});
  chart('chLiq', {type:'bar', data:{labels:lab, datasets:[{label:'Liquidités cumulées', data:r.rows.map(x=>x.cum), backgroundColor:c, borderRadius:3}]},
    options:{plugins:{legend:{display:false}, tooltip:tipCHF}, scales:{x:{title:{display:true,text:'Années'},grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF'}}}}});
  const surf = (r.v.acKwc + r.v.rueKwc)*1000/490*2.0412;
  document.getElementById('liqTxt').textContent = `Taux d'autoconsommation : ${fN(r.tauxAc*100,1)} % · consommation couverte : ${fN(r.couverture*100,1)} %. ${r.rows.length} ans : ${fCHF(r.cum)} CHF, soit ${fN(r.cum/surf,1)} CHF/m² de panneaux. Investissement entièrement payé après ${fY(r.payback)}.`;
  document.getElementById('tblFlux').innerHTML = '<thead><tr><th>Année</th><th>Production (kWh)</th><th>Recettes et économies</th><th>Assurance + maintenance</th><th>Intérêts</th><th>Subvention</th><th>Remboursement</th><th>Dette restante</th><th>Cash-flow</th><th>Liquidités cumulées</th></tr></thead><tbody>' +
    r.rows.map(x=>`<tr><td>${x.n}</td><td>${fN(x.prod)}</td><td>${fCHF(x.recettes)}</td><td>${fCHF(x.dep)}</td><td>${fCHF(x.interet)}</td><td>${x.subv?fCHF(x.subv):''}</td><td>${fCHF(x.remb)}</td><td>${fCHF(x.debt)}</td><td>${fCHF(x.cf)}</td><td>${fCHF(x.cum)}</td></tr>`).join('') + '</tbody>';
}

let detPer = 'week';
const DET_PER = {
  month:   {t:'Mois', opts: MONTHS.map((m,k)=>[m,[k]]), def:8},
  quarter: {t:'Trimestre', opts:[['oct.–déc. 2025',[0,1,2]],['janv.–mars 2026',[3,4,5]],['avr.–juin 2026',[6,7,8]],['juil.–sept. 2026',[9,10,11]]], def:2},
  half:    {t:'Semestre', opts:[['hiver : oct. 2025 – mars 2026',[0,1,2,3,4,5]],['été : avr. – sept. 2026',[6,7,8,9,10,11]]], def:1}};
function setDetPer(p){
  detPer = p;
  document.querySelectorAll('#detPer button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  document.getElementById('detDateL').style.display = p === 'week' ? '' : 'none';
  document.getElementById('detPickL').style.display = p === 'week' ? 'none' : '';
  if (p !== 'week'){
    const P = DET_PER[p], sel = document.getElementById('detPick');
    document.getElementById('detPickT').textContent = P.t;
    sel.innerHTML = P.opts.map((o,k)=>`<option value="${k}">${o[0]}</option>`).join(''); sel.value = String(P.def);
  }
  renderDetail();
}
document.querySelectorAll('#detPer button').forEach(b => b.onclick = () => setDetPer(b.dataset.p));
document.getElementById('detPick').onchange = () => renderDetail();
function detStep(dir){
  if (detPer === 'week'){
    const el = document.getElementById('detDate'), d = new Date(el.value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 7*dir);
    const iso = d.toISOString().slice(0,10); if (iso >= el.min && iso <= el.max) el.value = iso;
  } else { const sel = document.getElementById('detPick'), k = +sel.value + dir; if (k >= 0 && k < sel.options.length) sel.value = String(k); }
  renderDetail();
}
document.getElementById('detPrev').onclick = () => detStep(-1);
document.getElementById('detNext').onclick = () => detStep(1);
function renderDetail(){
  segs('detSel', detIdx, i => { detIdx = i; renderDetail(); });
  const r = RES[detIdx], S = YEAR, v = r.v;
  let i0, i1, agg, perTxt;
  if (detPer === 'week'){
    const dv = document.getElementById('detDate').value || '2026-06-08';
    i0 = Math.round((Date.UTC(+dv.slice(0,4), +dv.slice(5,7)-1, +dv.slice(8,10)) - S.t0)/900000);
    i0 = Math.max(0, Math.min(S.n - 672, i0)); i1 = i0 + 672; agg = 1;
    perTxt = 'semaine du ' + new Date(S.t0 + i0*900000).toLocaleDateString('fr-CH', {timeZone:'UTC'});
  } else {
    const P = DET_PER[detPer], o = P.opts[+document.getElementById('detPick').value || 0], ms = o[1];
    i0 = S.m.indexOf(ms[0]); i1 = i0; while (i1 < S.n && ms.includes(S.m[i1])) i1++;
    agg = {month:4, quarter:8, half:16}[detPer]; perTxt = o[0];
  }
  const lab = [], ld = [], pv = [], gr = [], so = [], dayStart = [];
  const days = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  let E = {load:0, pv:0, imp:0, exp:0, maxImp:0, maxLoad:0};
  for (let i = i0; i < i1; i += agg){
    const d = new Date(S.t0 + i*900000);
    let a = 0, b = 0, c = 0, s = 0, k = 0;
    for (let j = i; j < Math.min(i + agg, i1); j++, k++){ a += S.load[j]; b += v.prodAc*S.pv[j]; c += r.r.grid[j]; s += r.r.soc[j]; }
    ld.push(a/k); pv.push(b/k); gr.push(c/k); so.push(s/k);
    const hh = String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
    lab.push(`${days[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth()+1} ${hh}`);
    dayStart.push(detPer === 'week' ? (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) : detPer === 'month' ? (d.getUTCHours() === 0 && (d.getUTCDate()-1) % 3 === 0) : (d.getUTCDate() === 1 && d.getUTCHours() < agg/4));
  }
  for (let j = i0; j < i1; j++){ const L = S.load[j], y = r.r.grid[j]; E.load += L*DT; E.pv += v.prodAc*S.pv[j]*DT; if (y > 0){ E.imp += y*DT; E.maxImp = Math.max(E.maxImp, y); } else E.exp -= y*DT; E.maxLoad = Math.max(E.maxLoad, L); }
  const MO = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const tickLab = i => { const d = new Date(S.t0 + (i0 + i*agg)*900000); return detPer === 'week' ? days[d.getUTCDay()] + ' ' + d.getUTCDate() + '.' + (d.getUTCMonth()+1) : detPer === 'month' ? d.getUTCDate() + '.' + (d.getUTCMonth()+1) : MO[d.getUTCMonth()]; };
  const xax = {grid:{display:false}, ticks:{autoSkip:false, maxRotation:0, callback:(x,i)=> dayStart[i] ? tickLab(i) : ''}};
  const stepTxt = {1:'au quart d\'heure', 4:'moyenne par heure', 8:'moyenne par 2 heures', 16:'moyenne par 4 heures'}[agg];
  document.getElementById('detTitle').textContent = `Charge, production et réseau · ${perTxt} (${stepTxt})`;
  document.getElementById('detCap').textContent = 'Gris : consommation de l\'usine. Jaune : production de la partie autoconsommation. Bleu : réseau (au-dessus de zéro : soutiré, en dessous : revendu).' + (agg > 1 ? ' Sur les longues périodes les courbes sont des moyennes : les pointes exactes au quart d\'heure sont dans les chiffres ci-dessus et dans le tableau du bas.' : '');
  const auto = E.pv - E.exp;
  const kp = [[fN(E.load/1000,1)+' MWh','Consommation de l\'usine'], [fN(E.pv/1000,1)+' MWh','Production (autoconsommation)'], [fN(E.imp/1000,1)+' MWh','Soutiré au réseau'], [fN(E.exp/1000,1)+' MWh','Revendu au réseau'],
    [fN(E.pv>0?auto/E.pv*100:0,1)+' %','Taux d\'autoconsommation de la période'], [fN(E.maxImp)+' kW','Pointe soutirée (quart d\'heure)']];
  document.getElementById('detKpi').innerHTML = kp.map(k=>`<div class="kpi"><b>${k[0]}</b><span>${k[1]}</span></div>`).join('');
  const lw = agg === 1 ? 1.5 : 1;
  chart('chWeek', {type:'line', data:{labels:lab, datasets:[
      {label:'Consommation', data:ld, borderColor:GREY, borderWidth:lw, pointRadius:0},
      {label:'Production PV (autoconso)', data:pv, borderColor:'#eda100', borderWidth:lw+0.3, pointRadius:0},
      {label:'Réseau (+ soutiré / − revendu)', data:gr, borderColor:COLORS[detIdx], borderWidth:lw, pointRadius:0}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:xax, y:{...gridY, title:{display:true,text:'kW'}}}}});
  chart('chSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:lw, pointRadius:0}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`${fN(c.parsed.y)} kWh`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kWh'}}}}});
  document.getElementById('tblMonth').innerHTML = '<thead><tr><th>Mois</th><th>Pointe sans PV (kW)</th>' + RES.map((x,i)=>`<th style="color:${COLORS[i]}">Pointe ${x.v.name.split(' · ')[0]} (kW)</th>`).join('') + RES.map((x,i)=>`<th style="color:${COLORS[i]}">Soutirage ${x.v.name.split(' · ')[0]} (MWh)</th>`).join('') + '</tr></thead><tbody>' +
    MONTHS.map((m,k)=>`<tr><td>${m}</td><td>${fN(BASE.peak[k])}</td>${RES.map(x=>`<td>${fN(x.peakMonths[k])}</td>`).join('')}${RES.map(x=>`<td>${fN(x.impMonths[k]/1000)}</td>`).join('')}</tr>`).join('') + '</tbody>';
}

/* ---------------- Peak shaving ---------------- */
let psIdx = 0, psMode = 'day';
(function initPS(){
  const sel = document.getElementById('psMonth');
  sel.innerHTML = MONTHS.map((m,k)=>`<option value="${k}">${m}</option>`).join('');
  sel.value = '3';
  sel.onchange = () => renderPS();
  document.getElementById('psDay').onchange = () => renderPS();
  document.querySelectorAll('#psMode button').forEach(b => b.onclick = () => {
    psMode = b.dataset.m;
    document.querySelectorAll('#psMode button').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('psDayL').style.display = psMode === 'day' ? '' : 'none';
    document.getElementById('psMonthL').style.display = psMode === 'month' ? '' : 'none';
    renderPS();
  });
  const step = s => {
    if (psMode === 'month'){ sel.value = String(Math.max(0, Math.min(11, +sel.value + s))); }
    else { const el = document.getElementById('psDay'), d = new Date(el.value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + s);
      const iso = d.toISOString().slice(0,10); if (iso >= el.min && iso <= el.max) el.value = iso; }
    renderPS();
  };
  document.getElementById('psPrev').onclick = () => step(-1);
  document.getElementById('psNext').onclick = () => step(1);
})();
function renderPS(){
  segs('psSel', psIdx, i => { psIdx = i; renderPS(); });
  togs('psTog', psIdx);
  const r = RES[psIdx], S = YEAR, sim_ = r.r;
  let i0, i1;
  if (psMode === 'day'){
    const dv = document.getElementById('psDay').value || '2026-01-07';
    i0 = Math.round((Date.UTC(+dv.slice(0,4), +dv.slice(5,7)-1, +dv.slice(8,10)) - S.t0)/900000);
    i0 = Math.max(0, Math.min(S.n - 96, i0)); i1 = i0 + 96;
  } else {
    const mk = +document.getElementById('psMonth').value;
    i0 = S.m.indexOf(mk); i1 = i0; while (i1 < S.n && S.m[i1] === mk) i1++;
  }
  const days = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  const lab = [], ld = [], pv = [], net = [], gr = [], thr = [], cS = [], cG = [], dP = [], dA = [], so = [], rsv = [];
  let E = {load:0, pv:0, direct:0, pvBat:0, pvSold:0, gridBat:0, batPeak:0, batAc:0, imp:0, maxNet:0, maxImp:0, hours:0};
  const hasBat = r.hasBat;
  for (let i = i0; i < i1; i++){
    const d = new Date(S.t0 + i*900000);
    const hh = String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
    lab.push(psMode === 'day' ? hh : `${days[d.getUTCDay()]} ${d.getUTCDate()} ${hh}`);
    const L = S.load[i], P = r.v.prodAc*S.pv[i], x = L - P, y = sim_.grid[i];
    const c = sim_.ch[i], dd = sim_.dis15[i], k = sim_.kind[i];
    ld.push(L); pv.push(P); net.push(Math.max(x,0)); gr.push(Math.max(y,0)); thr.push(hasBat && r.mode===0 && isFinite(sim_.thr[i]) ? sim_.thr[i] : null);
    rsv.push(hasBat && r.mode===0 ? ((S.wk[i] && r.v.wkFree === true) ? 0 : (S.su[i] ? r.Rs : r.R)*r.cap) : null); cS.push(k===1 ? c : 0); cG.push(k===2 ? c : 0); dP.push(k===3 ? -dd : 0); dA.push(k===4 ? -dd : 0); so.push(sim_.soc[i]);
    E.load += L*DT; E.pv += P*DT; E.direct += Math.min(L,P)*DT;
    if (k===1) E.pvBat += c*DT; if (k===2) E.gridBat += c*DT; if (k===3) E.batPeak += dd*DT; if (k===4) E.batAc += dd*DT;
    E.pvSold += Math.max(-y,0)*DT; E.imp += Math.max(y,0)*DT;
    E.maxNet = Math.max(E.maxNet, x); E.maxImp = Math.max(E.maxImp, y);
    if (k===3 && dd > 0) E.hours += DT;
  }
  const cut = E.maxNet - E.maxImp;
  const kp = [
    [fN(E.maxNet)+' kW', 'Pointe sans batterie', 'Plus forte puissance qui serait soutirée avec le solaire seul sur la période.'],
    [fN(E.maxImp)+' kW', 'Pointe réelle soutirée', 'Plus forte puissance réellement soutirée au réseau, batterie comprise.'],
    [fN(cut)+' kW', 'Pointe écrêtée', 'Écart entre les deux pointes. Facturé au tarif de puissance quand c\'est la pointe du mois.'],
    [psMode==='month' ? fCHF(cut*G.puiss)+' CHF' : fN(E.hours,1)+' h', psMode==='month' ? 'Économie de puissance du mois' : 'Durée d\'écrêtage', psMode==='month' ? 'kW écrêtés × tarif de puissance.' : 'Temps pendant lequel la batterie a écrêté une pointe ce jour-là.'],
    [fN(E.imp/1000,1)+' MWh', 'Soutiré au réseau', 'Énergie achetée au réseau sur la période, recharge de la batterie comprise ('+fN(E.gridBat/1000,1)+' MWh).'],
    [fN(E.pvSold/1000,1)+' MWh', 'Surplus revendu', 'Production solaire que ni l\'usine ni la batterie n\'ont pu utiliser.']];
  document.getElementById('psKpi').innerHTML = kp.map(k=>`<div class="kpi"><b>${k[0]}</b><span>${k[1]} <i class="tip" data-tip="${k[2]}">i</i></span></div>`).join('');
  bindTips(document.getElementById('psKpi'));
  renderPSCost(r);
  explainPS(r);
  const tick = psMode === 'day'
    ? {autoSkip:false, maxRotation:0, callback:(v,i)=> i%8===0 ? lab[i] : ''}
    : {autoSkip:false, maxRotation:0, callback:(v,i)=> (i%96===0 && (i/96)%2===0) ? lab[i].split(' ').slice(0,2).join(' ') : ''};
  const xax = {grid:{display:false}, ticks:tick};
  const thin = psMode === 'day' ? 1.8 : 1.1;
  chart('psMain', {type:'line', data:{labels:lab, datasets:[
      {label:'Consommation', data:ld, borderColor:GREY, borderWidth:thin, pointRadius:0},
      {label:'Production solaire', data:pv, borderColor:'#eda100', borderWidth:thin, pointRadius:0},
      {label:'Soutirage sans batterie', data:net, borderColor:'#c0392b', borderDash:[4,3], borderWidth:thin, pointRadius:0},
      {label:'Soutirage réel', data:gr, borderColor:COLORS[psIdx], borderWidth:thin+0.4, pointRadius:0},
      {label:'Seuil de pointe', data:thr, borderColor:'#1a1a19', borderDash:[2,3], borderWidth:1, pointRadius:0, spanGaps:true}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>c.parsed.y===null?'':`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kW'}}}}});
  chart('psBat', {type:'bar', data:{labels:lab, datasets:[
      {label:'Charge solaire', data:cS, backgroundColor:'#1baf7a', stack:'s'},
      {label:'Charge réseau', data:cG, backgroundColor:'#8c8b86', stack:'s'},
      {label:'Décharge peak shaving', data:dP, backgroundColor:'#c0392b', stack:'s'},
      {label:'Décharge autoconsommation', data:dA, backgroundColor:'#2a78d6', stack:'s'}]},
    options:{animation:false, barPercentage:1, categoryPercentage:1, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{filter:c=>c.parsed.y!==0, callbacks:{label:c=>`${c.dataset.label}: ${fN(Math.abs(c.parsed.y))} kW`}}}, scales:{x:{...xax, stacked:true}, y:{...gridY, stacked:true, title:{display:true,text:'kW'}}}}});
  chart('psSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:1.5, pointRadius:0},
      {label:'Réserve gardée pour les pointes', data:rsv, borderColor:'#c0392b', borderDash:[5,3], borderWidth:1.3, pointRadius:0, fill:false, stepped:true}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:true, position:'bottom'}, tooltip:{callbacks:{label:c=>`${fN(c.parsed.y)} kWh`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kWh'}}}}});
  const hb = (id, parts, total) => chart(id, {type:'bar', data:{labels:[''], datasets: parts.map(p=>({label:`${p[0]} : ${fN(p[1]/1000,1)} MWh (${total?fN(p[1]/total*100):0} %)`, data:[p[1]/1000], backgroundColor:p[2]}))},
    options:{indexAxis:'y', animation:false, plugins:{legend:{position:'bottom', labels:{boxWidth:12}}, tooltip:{callbacks:{label:c=>c.dataset.label}}}, scales:{x:{stacked:true, ...gridY, title:{display:true,text:'MWh'}}, y:{stacked:true, grid:{display:false}}}}});
  document.getElementById('psRate').textContent = `Taux d'autoconsommation sur la période : ${E.pv ? fN((E.pv - E.pvSold)/E.pv*100,1) : 0} % · consommation couverte par le solaire : ${E.load ? fN((E.direct + E.pvBat*G.eta*G.eta)/E.load*100,1) : 0} %.`;
  hb('psUse', [['Utilisée directement', E.direct, '#2a78d6'], ['Stockée dans la batterie', E.pvBat, '#1baf7a'], ['Revendue', E.pvSold, '#eda100']], E.pv);
  hb('psSrc', [['Solaire direct', E.direct, '#eda100'], ['Batterie (pointes)', E.batPeak, '#c0392b'], ['Batterie (autoconso)', E.batAc, '#1baf7a'], ['Réseau', E.load - E.direct - E.batPeak - E.batAc, '#8c8b86']], E.load);
}


// Explications du pilotage, recalculées pour chaque variante et chaque réglage
const whyCache = new Map();
function altRun(v, T, R, Rs, psOn){
  const keep = G.auto; G.auto = false;
  try { return compute(Object.assign({}, v, {T, R, Rs, psOn: psOn ?? v.psOn})); } finally { G.auto = keep; }
}
function explainPS(r){
  const el = document.getElementById('psWhy'); if (!el) return;
  const v = r.v, key = JSON.stringify([v, G, r.T, r.R, r.Rs]);
  if (whyCache.has(key)){ el.innerHTML = whyCache.get(key); bindTips(el); return; }
  const n = v.name, P = G.puiss, peakB = BASE.peak.reduce((a,b)=>a+b,0);
  const gainPv = (peakB - r.peakPv.reduce((a,b)=>a+b,0))*P, gainBat = (r.peakPv.reduce((a,b)=>a+b,0) - r.peakMonths.reduce((a,b)=>a+b,0))*P;
  const tot = x => x.year1;
  let h = '';
  if (!r.hasBat){
    h = `<p><b>${n} sans batterie.</b> Il n'y a rien à piloter : le solaire couvre ce qu'il peut au moment où il produit, le reste est revendu. Les pointes ne baissent que quand elles tombent en plein soleil, soit ${fCHF(gainPv)} CHF par an d'économie de puissance.</p>`;
    if (v.batKwh > 0){ const w = compute(Object.assign({}, v, {batOn:true, psOn:true})); h += `<p>Avec la batterie prévue (${fN(v.batKwh)} kWh / ${fN(v.batKw)} kW) et le peak shaving, les recettes de la 1re année passeraient de ${fCHF(tot(r))} à ${fCHF(tot(w))} CHF (+${fCHF(tot(w)-tot(r))} CHF), pour un surcoût de ${fCHF(v.batReduc)} CHF.</p>`; }
  } else if (r.mode === 1){
    const w = compute(Object.assign({}, v, {psOn:true}));
    h = `<p><b>${n} : batterie en autoconsommation seule, sans peak shaving.</b> La batterie stocke le surplus solaire et le rend dès que l'usine consomme, sans s'occuper des pointes. Elle fait monter le taux d'autoconsommation (${fN(r.tauxAc0*100,1)} % → ${fN(r.tauxAc*100,1)} %), mais chaque kWh déplacé ne rapporte que la différence entre le prix évité (${fN(v.acPrice*100,2)} ct) et la revente perdue (${fN(G.rev*100,2)} ct), moins ${fN((1-G.eta*G.eta)*100)} % de pertes.</p>
      <p>Avec le peak shaving activé, la même batterie rapporterait ${fCHF(tot(w)-tot(r))} CHF de plus par an (recettes 1re année ${fCHF(tot(w))} au lieu de ${fCHF(tot(r))} CHF), surtout grâce à la baisse de la pointe facturée.</p>`;
  } else {
    const T = r.T, cap = r.cap, rw = r.R*cap, rs = r.Rs*cap;
    const lo = altRun(v, Math.max(T-50, 300), r.R, r.Rs), hi = altRun(v, T+50, r.R, r.Rs), z = altRun(v, T, 0, 0);
    const held = MONTHS.filter((m,k)=>r.peakMonths[k] <= T + 5);
    const S = YEAR, mx = new Array(12).fill(-1), mi = new Array(12).fill(0);
    for (let i = 0; i < S.n; i++){ const k = S.m[i]; if (r.r.grid[i] > mx[k]){ mx[k] = r.r.grid[i]; mi[k] = i; } }
    const why = {energie:[], puissance:[], weekend:[]};
    MONTHS.forEach((m,k) => { if (r.peakMonths[k] <= T + 5) return; const i = mi[k], x = S.load[i] - v.prodAc*S.pv[i];
      const d = new Date(S.t0 + i*900000), when = `${m} (${['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'][d.getUTCDay()]} ${d.getUTCDate()}, ${String(d.getUTCHours()).padStart(2,'0')}h${String(d.getUTCMinutes()).padStart(2,'0')}, ${fN(r.peakMonths[k])} kW)`;
      if (x - T > v.batKw + 1 && (i === 0 || r.r.soc[i-1] > 1)) why.puissance.push(when); else if (S.wk[i]) why.weekend.push(when); else why.energie.push(when); });
    const alts = [[Math.max(T-50,300), lo], [T, r], [T+50, hi]], bestAlt = alts.reduce((a,b)=> tot(b[1]) > tot(a[1]) ? b : a);
    const vSun = v.acPrice - G.rev/(G.eta*G.eta), vGrid = v.acPrice - v.acPrice/(G.eta*G.eta);
    h = `<p><b>${n} : ${fN(v.batKwh)} kWh / ${fN(v.batKw)} kW, peak shaving activé${G.auto ? ', réglage automatique' : ', réglage manuel'}.</b> ` +
      `<span class="scen-note">Scénario <b>${scen().t}</b> : ${scen().d}</span> ` + (G.auto ? `Le simulateur a testé tous les seuils de 520 à 960 kW et plusieurs réserves sur la courbe de janvier à septembre 2025, et garde la combinaison qui coûte le moins cher (énergie + puissance + énergie réactive − revente).` : `Les valeurs viennent de l'onglet Paramètres.`) + `</p>
      <table class="why"><tr><td>Seuil de pointe</td><td><b>${fN(T)} kW</b></td><td>Au-dessus, la batterie se décharge (jusqu'à ${fN(v.batKw)} kW).</td></tr>
      <tr><td>Réserve hiver (oct.–mars)</td><td><b>${fN(rw)} kWh</b> sur ${fN(cap)}</td><td>${r.R >= 0.999 ? 'Toute la batterie est gardée pour les pointes en semaine : en hiver les pointes durent des heures et le solaire ne la recharge pas.' : 'Énergie gardée pour les pointes en semaine ; le reste couvre l\'usine.'}</td></tr>
      <tr><td>Réserve été (avr.–sept.)</td><td><b>${fN(rs)} kWh</b> sur ${fN(cap)}</td><td>${r.Rs >= 0.999 ? 'Toute la batterie est gardée pour les pointes.' : `Au-dessus de ${fN(rs)} kWh, la batterie couvre l'usine ; le surplus solaire la remplit à nouveau.`}</td></tr></table>
      <p><b>Pourquoi ${fN(T)} kW et pas un autre seuil ?</b> Plus le seuil est bas, plus il faut d'énergie pour le tenir : la batterie se vide et la pointe passe quand même, ce qui coûte tout le mois. Plus il est haut, moins on gagne de kW.</p>
      <table class="why"><tr><th>Seuil</th><th>Gain de puissance par an</th><th>Recettes 1re année</th></tr>
      <tr><td>${fN(Math.max(T-50,300))} kW</td><td>${fCHF(lo.sPeak)} CHF</td><td>${fCHF(tot(lo))} CHF</td></tr>
      <tr class="hl"><td>${fN(T)} kW (retenu)</td><td>${fCHF(r.sPeak)} CHF</td><td>${fCHF(tot(r))} CHF</td></tr>
      <tr><td>${fN(T+50)} kW</td><td>${fCHF(hi.sPeak)} CHF</td><td>${fCHF(tot(hi))} CHF</td></tr></table>
      ${bestAlt[0] !== T ? `<p class="note-warn">Sur l'année simulée (oct. 2025 – sept. 2026), un seuil de ${fN(bestAlt[0])} kW aurait rapporté ${fCHF(tot(bestAlt[1]) - tot(r))} CHF de plus. ${G.auto ? `Le réglage automatique est fait sur janvier–septembre 2025, sans connaître les pointes de l'année simulée, comme le ferait le vrai pilotage : cet écart montre la marge d'incertitude du réglage.` : `Vous pouvez essayer cette valeur dans l'onglet Paramètres.`}</p>` : `<p>Sur l'année simulée, ${fN(T)} kW est bien le meilleur des trois seuils.</p>`}
      <p><b>Mois où le seuil tient :</b> ${held.length ? held.join(', ') : 'aucun'}.</p>
      ${why.energie.length ? `<p><b>Batterie vide au moment de la pointe :</b> ${why.energie.join(' ; ')}. ${G.gridChg ? `La pointe a duré trop longtemps pour l'énergie disponible (${fN(cap)} kWh utiles), surtout en hiver quand le solaire ne recharge pas.` : `Sans recharge sur le réseau, la batterie (${fN(cap)} kWh utiles) ne se remplit qu'au soleil : tôt le matin, le soir ou après des jours gris, elle était vide ou trop basse au moment de la pointe.`}</p>` : ''}
      ${why.puissance.length ? `<p><b>Puissance de la batterie trop faible :</b> ${why.puissance.join(' ; ')}. L'usine a dépassé le seuil de plus de ${fN(v.batKw)} kW, la puissance maximale de décharge : la batterie ne peut couper que ${fN(v.batKw)} kW.</p>` : ''}
      ${why.weekend.length ? `<p><b>Pointe pendant le week-end :</b> ${why.weekend.join(' ; ')}. ${v.wkFree === true ? `Le week-end, la réserve est libérée pour l'usine ; la batterie n'avait plus assez d'énergie.` : `La batterie, vidée par une pointe précédente, ne s'était pas assez rechargée au soleil.`}</p>` : ''}
      ${held.length < 12 ? `<p class="cap">Même quand le seuil ne tient pas, la pointe de ces mois reste plus basse que sans batterie.</p>` : ''}
      <p><b>Pourquoi la batterie reste parfois à sa réserve sans servir l'usine ?</b> Parce qu'un kWh gardé pour une pointe vaut beaucoup plus qu'un kWh consommé :</p>
      <ul>
        <li>Un kWh pris dans la batterie pour l'usine fait gagner ${fN(vSun*100,2)} ct s'il est rechargé avec du solaire (on évite ${fN(v.acPrice*100,2)} ct, mais on ne revend pas ${fN(G.rev*100,2)} ct et on perd ${fN((1-G.eta*G.eta)*100)} %), ${G.gridChg ? `et fait <b>perdre</b> ${fN(-vGrid*100,2)} ct s'il est rechargé sur le réseau (pertes seules)` : `; la batterie n'est jamais rechargée sur le réseau, donc chaque kWh donné à l'usine manque si une pointe arrive avant le prochain soleil`}.</li>
        <li>Une pointe ratée coûte ${fN(P,2)} CHF par kW pour tout le mois : 100 kW de trop = ${fCHF(100*P)} CHF.</li>
        <li>Test sur l'année avec ${n} : si la batterie n'avait aucune réserve et servait d'abord l'usine, les recettes de la 1re année seraient de ${fCHF(tot(z))} CHF au lieu de ${fCHF(tot(r))} CHF, soit <b>${fCHF(tot(r)-tot(z))} CHF de moins par an</b>, parce que des pointes passeraient (gain de puissance ${fCHF(z.sPeak)} au lieu de ${fCHF(r.sPeak)} CHF).</li>
      </ul>
      <p>Répartition de l'économie de puissance : ${fCHF(gainPv)} CHF grâce au solaire seul, ${fCHF(gainBat)} CHF grâce au peak shaving.</p>`;
    if (!G.auto){
      const keep = G.auto; G.auto = true; let a; try { a = compute(v); } finally { G.auto = keep; }
      h += `<p class="cap">Pour comparaison, le réglage automatique choisirait ${fN(a.T)} kW, réserve hiver ${fN(a.R*cap)} kWh et été ${fN(a.Rs*cap)} kWh, avec des recettes 1re année de ${fCHF(tot(a))} CHF (${tot(a) >= tot(r) ? '+' : '−'}${fCHF(Math.abs(tot(a)-tot(r)))} CHF par rapport à vos réglages).</p>`;
    }
  }
  whyCache.set(key, h); el.innerHTML = h; bindTips(el);
}

// Coût des pointes mois par mois, règles de la batterie, été / hiver
function renderPSCost(r){
  const S = YEAR, v = r.v, ps = r.hasBat && r.mode === 0, T = r.T;
  const need = [], hrs = [];
  for (let m = 0; m < 12; m++){ need.push(0); hrs.push(0); }
  if (ps){
    const day = {};
    for (let i = 0; i < S.n; i++){
      if (S.wk[i]) continue;
      const x = S.load[i] - v.prodAc*S.pv[i], d = Math.floor(i/96), k = S.m[i];
      if (!day[d]) day[d] = {k, e:0, h:0};
      if (x > T){ day[d].e += (x - T)*DT; day[d].h += DT; }
    }
    Object.values(day).forEach(d => { need[d.k] = Math.max(need[d.k], d.e); hrs[d.k] = Math.max(hrs[d.k], d.h); });
  }
  let tS = 0, tB = 0;
  const rows = MONTHS.map((mo, k) => {
    const b = BASE.peak[k], p0 = r.peakPv[k], p = r.peakMonths[k], gS = (b - p0)*G.puiss, gB = (p0 - p)*G.puiss;
    tS += gS; tB += gB;
    const held = ps && p <= T + 5;
    return `<tr><td>${mo}</td><td>${fN(b)}</td><td>${fN(p0)}</td><td style="font-weight:600">${fN(p)}</td><td>${fN(b - p)}</td><td>${fCHF(gS)}</td><td>${fCHF(gB)}</td><td style="font-weight:600">${fCHF(gS + gB)}</td>` +
      (ps ? `<td>${fN(need[k])}</td><td>${fN(hrs[k],1)}</td><td style="color:${held?'var(--good)':'#b3261e'}">${held?'oui':'non'}</td>` : '') + '</tr>';
  }).join('');
  document.getElementById('psCost').innerHTML = `<thead><tr><th>Mois</th><th>Sans solaire (kW)</th><th>Solaire seul (kW)</th><th>Solaire + batterie (kW)</th><th>kW en moins</th><th>Gain solaire (CHF)</th><th>Gain batterie (CHF)</th><th>Gain du mois (CHF)</th>` +
    (ps ? `<th>Besoin pire jour (kWh)</th><th>Heures au-dessus du seuil</th><th>Seuil tenu</th>` : '') + `</tr></thead><tbody>${rows}` +
    `<tr class="hl"><td>Total année</td><td></td><td></td><td></td><td></td><td>${fCHF(tS)}</td><td>${fCHF(tB)}</td><td>${fCHF(tS + tB)}</td>${ps?'<td></td><td></td><td></td>':''}</tr></tbody>`;
  document.getElementById('psCostTxt').innerHTML = `Chaque mois, Romande Energie facture la plus haute puissance soutirée sur un quart d'heure, à ${fN(G.puiss,2)} CHF par kW. Économie du mois = (pointe sans solaire − pointe avec solaire et batterie) × ${fN(G.puiss,2)} CHF. ` +
    (ps && scen().k < 1 ? `Scénario prudent : seuls ${fN(scen().k*100)} % du gain de la batterie sont comptés dans les flux (${fCHF(r.sPeak)} CHF par an au total). ` : '') + (ps ? `La batterie contient ${fN(r.cap)} kWh utiles : quand le besoin d'un jour de semaine dépasse cette quantité (surtout en hiver, quand l'usine reste des heures au-dessus du seuil et que le solaire produit peu), la pointe passe et compte pour tout le mois.` : 'Sans peak shaving, seul le solaire réduit la pointe.');
  const cap = r.cap, rule = document.getElementById('psRules');
  rule.innerHTML = !r.hasBat ? '<p>Pas de batterie dans cette variante.</p>' : `
    <div class="kpirow" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><b>${fN(cap)} kWh</b><span>Capacité utile (${fN(G.usable*100)} % de ${fN(v.batKwh)} kWh)</span></div>
      <div class="kpi"><b>${ps ? fN(T)+' kW' : '–'}</b><span>Seuil de pointe visé</span></div>
      <div class="kpi"><b>${ps ? fN(r.R*cap)+' kWh' : '–'}</b><span>Réserve pour les pointes, hiver (oct.–mars)</span></div>
      <div class="kpi"><b>${ps ? fN(r.Rs*cap)+' kWh' : '–'}</b><span>Réserve pour les pointes, été (avr.–sept.)</span></div></div>
    <ol class="rules">
      <li><b>Trop de soleil :</b> le surplus charge la batterie ; quand elle est pleine, le reste est revendu.</li>
      ${ps ? `<li><b>L'usine tire plus de ${fN(T)} kW :</b> la batterie se décharge (jusqu'à ${fN(v.batKw)} kW) pour que le réseau ne fournisse pas plus que le seuil. Si une pointe passe quand même, le seuil remonte jusqu'à la fin du mois, puisque la pointe facturée est déjà atteinte.</li>
      <li><b>Sous le seuil, batterie au-dessus de la réserve :</b> l'énergie en trop couvre la consommation de l'usine.</li>
      ${G.gridChg ? `<li><b>Bien sous le seuil (moins de ${fN(T-100)} kW) et batterie sous la réserve :</b> recharge sur le réseau jusqu'à la réserve seulement, sans dépasser ${fN(T-50)} kW de soutirage.</li>` : `<li><b>Jamais de recharge sur le réseau :</b> la batterie ne se remplit qu'avec le surplus solaire. Quand le soleil ne suffit pas (hiver, mauvais temps), elle peut rester vide plusieurs jours et ne coupe alors plus les pointes.</li>`}
      ${v.wkFree === true ? `<li><b>Week-end (vendredi 22h – dimanche 20h) :</b> pas de réserve, la batterie couvre l'usine et se remplit au soleil.</li>` : `<li><b>Week-end :</b> la réserve est gardée aussi ; le surplus solaire du week-end remplit la batterie, qui est pleine pour les pointes du lundi matin.</li>`}` :
      `<li><b>Sans peak shaving :</b> la batterie couvre la consommation de l'usine dès qu'elle contient de l'énergie.</li>`}
    </ol>
    ${ps ? `<p class="cap">Pourquoi garder la réserve : une seule pointe ratée coûte (kW au-dessus du seuil) × ${fN(G.puiss,2)} CHF pour tout le mois, par exemple 240 kW = ${fCHF(240*G.puiss)} CHF. Vider la batterie la nuit pour l'usine ne rapporte qu'environ 1 ct par kWh (on économise ${fN(v.acPrice*100,1)} ct, mais on la recharge avec du solaire qui aurait été revendu ${fN(G.rev*100,2)} ct, avec ${fN((1-G.eta*G.eta)*100)} % de pertes).</p>` : ''}`;
}

/* ---------------- Paramètres ---------------- */
function inputCell(val, dec, attrs){ return dec === -1 ? `<label class="sw"><input type="checkbox" ${attrs} ${val?'checked':''}><span class="k"></span></label>` : `<input type="number" step="any" ${attrs} value="${+(+val).toFixed(Math.max(dec,0)+2)}">`; }
function renderParams(){
  document.getElementById('tblVar').innerHTML = '<thead><tr><th>Paramètre</th>' + V.map((v,i)=>`<th style="color:${COLORS[i]}">${v.name}</th>`).join('') + '</tr></thead><tbody>' +
    VAR_FIELDS.map(f => f[0]==='sec' ? `<tr><td class="sec" colspan="4">${f[1]}</td></tr>` :
      `<tr><td>${f[1]} <i class="tip" data-tip="${f[3]}">i</i></td>${V.map((v,i)=>`<td>${inputCell(v[f[0]], f[2], `data-v="${i}" data-k="${f[0]}"`)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  document.getElementById('tblGlob').innerHTML = '<tbody>' + GLOB_FIELDS.map(f => f[0]==='sec' ? `<tr><td class="sec" colspan="2">${f[1]}</td></tr>` :
      `<tr><td>${f[1]} <i class="tip" data-tip="${f[3]}">i</i></td><td>${inputCell(G[f[0]], f[2], `data-g="${f[0]}"`)}</td></tr>`).join('') + '</tbody>';
  document.querySelectorAll('#tab-param input').forEach(inp => inp.onchange = e => {
    const t = e.target, val = t.type === 'checkbox' ? t.checked : parseFloat(t.value);
    if (t.type !== 'checkbox' && !isFinite(val)) return;
    if (t.dataset.g) { G[t.dataset.g] = val; tuneCache.clear(); BASE = null; } else V[+t.dataset.v][t.dataset.k] = val;
    save(); schedule();
  });
  bindTips(document.getElementById('tab-param'));
}

/* ---------------- Bulles d'aide ---------------- */
const tipbox = document.getElementById('tipbox');
function bindTips(root){
  root.querySelectorAll('.tip').forEach(t => {
    t.onmouseenter = () => { tipbox.textContent = t.dataset.tip; tipbox.style.opacity = 1; const b = t.getBoundingClientRect();
      tipbox.style.left = Math.min(b.left, innerWidth - 320) + 'px'; tipbox.style.top = (b.bottom + 6) + 'px'; };
    t.onmouseleave = () => tipbox.style.opacity = 0;
  });
}


/* ---------------- Taille de batterie optimale ---------------- */
let bsIdx = 1, bsRun = 0, bsData = null;
const BS = {perKwh: 186, ratio: 0.5, max: 1500, step: 100};
function bsFixed(v){ return Math.max(0, v.batReduc - BS.perKwh*v.batKwh); } // coûts fixes de la batterie actuelle (raccordement, génie civil…)
function bsCost(v, kwh){ return kwh > 0 ? bsFixed(v) + BS.perKwh*kwh : 0; }
function bsSizes(){ const a = []; for (let k = 0; k <= BS.max + 1e-9; k += BS.step) a.push(Math.round(k)); return a; }
function bsVariant(v, kwh){
  const c = bsCost(v, kwh), base = v.price - (v.batOn ? v.batReduc : 0) + (v.batOn ? 0 : 0);
  // prix sans batterie = prix de l'offre − batterie actuelle ; on ajoute le coût de la taille testée
  const priceNoBat = v.price - v.batReduc;
  return Object.assign({}, v, {batOn: kwh > 0, psOn: true, batKwh: kwh, batKw: Math.round(kwh*BS.ratio), batReduc: c, price: priceNoBat + c});
}
function bsKey(){ return JSON.stringify([V.map(v=>[v.prodAc,v.prodRue,v.acKwc,v.rueKwc,v.price,v.batReduc,v.batKwh,v.acPrice,v.wkFree]), G, BS]); }
function renderBS(force){
  segs('bsSel', bsIdx, i => { bsIdx = i; drawBS(); });
  ['perKwh','ratio','max','step'].forEach(k => { const el = document.getElementById('bs_' + k); if (el && document.activeElement !== el) el.value = BS[k]; });
  const key = bsKey();
  if (bsData && bsData.key === key){ drawBS(); return; }
  if (!force && !document.getElementById('tab-bat').classList.contains('active')) return;
  if (!bsData || bsData.key !== key){ if (!cfOptDone) cfOptimize(); else renderCF(); }
  const run = ++bsRun, sizes = bsSizes(), jobs = [];
  V.forEach((v,i) => sizes.forEach(k => jobs.push([i,k])));
  const res = V.map(() => []);
  let n = 0;
  const st = document.getElementById('bsStatus');
  const step = () => {
    if (run !== bsRun) return;
    const t0 = performance.now();
    while (n < jobs.length && performance.now() - t0 < 120){
      const [i,k] = jobs[n++], v = V[i], vv = bsVariant(v, k), r = compute(vv), H = r.rows.length;
      const sh = r.r; let ps = 0, ac = 0;
      if (k > 0) for (let q = 0; q < YEAR.n; q++){ if (sh.kind[q] === 3) ps += sh.dis15[q]*DT; else if (sh.kind[q] === 4) ac += sh.dis15[q]*DT; }
      res[i].push({k, kw: vv.batKw, cost: vv.batReduc, cum: r.rows[H-1].cum, cum20: r.rows[Math.min(19,H-1)].cum, y1: r.year1, sPeak: r.sPeak, sEnergy: r.sEnergy, sExp: r.sExp, sQ: r.sQ,
        taux: r.tauxAc, cyc: k > 0 ? sh.chg/(k*G.usable) : 0, held: k > 0 ? r.peakMonths.filter(p => p <= r.T + 5).length : 0, T: k > 0 ? r.T : null, ps, ac, pay: r.payback});
    }
    st.textContent = n < jobs.length ? `Calcul ${Math.round(n/jobs.length*100)} % (${n}/${jobs.length} cas)…` : `${jobs.length} cas calculés · scénario ${scen().t}`;
    if (n < jobs.length) setTimeout(step, 0);
    else { bsData = {key, res, H: Math.round(G.horizon)}; drawBS(); }
  };
  st.textContent = 'Calcul…'; setTimeout(step, 0);
}
function bsBest(a){ return a.reduce((b,x) => x.cum > b.cum ? x : b, a[0]); }
function drawBS(){
  if (!bsData) return;
  const res = bsData.res, H = bsData.H, sizes = res[0].map(x => x.k), lab = sizes.map(k => fN(k));
  const d0 = res.map(a => a[0].cum);
  // 1) gain net de la batterie sur la durée, par variante
  chart('bsGain', {type:'line', data:{labels:lab, datasets:res.map((a,i)=>({label:V[i].name, data:a.map(x=>x.cum - d0[i]), borderColor:COLORS[i], backgroundColor:COLORS[i], borderWidth:2.5, pointRadius:a.map(x=> x === bsBest(a) ? 6 : 2), pointStyle:a.map(x=> x === bsBest(a) ? 'rectRot' : 'circle')}))},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{title:c=>`Batterie ${c[0].label} kWh / ${fN(+sizes[c[0].dataIndex]*BS.ratio)} kW`, label:c=>`${c.dataset.label} : ${c.parsed.y>=0?'+':''}${fCHF(c.parsed.y)} CHF`}}},
      scales:{x:{title:{display:true,text:'Capacité de la batterie (kWh)'}, grid:{display:false}}, y:{...gridY, title:{display:true,text:`CHF sur ${H} ans vs sans batterie`}}}}});
  const a = res[bsIdx], v = V[bsIdx], b = bsBest(a), base = a[0];
  // 2) gains annuels par poste dus à la batterie
  chart('bsPost', {type:'bar', data:{labels:lab, datasets:[
      {label:'Pointe facturée', data:a.map(x=>x.sPeak-base.sPeak), backgroundColor:'#c0392b', stack:'s'},
      {label:'Achats évités', data:a.map(x=>x.sEnergy-base.sEnergy), backgroundColor:'#2a78d6', stack:'s'},
      {label:'Revente perdue', data:a.map(x=>x.sExp-base.sExp), backgroundColor:'#eda100', stack:'s'},
      {label:'Énergie réactive', data:a.map(x=>x.sQ-base.sQ), backgroundColor:'#8c8b86', stack:'s'},
      {type:'line', label:'Coût annuel de la batterie (amortissement sur la durée + assurance/maintenance)', data:a.map(x=>x.cost/H + x.cost*(G.assur+G.maint)), borderColor:'#1a1a19', borderDash:[5,4], borderWidth:2, pointRadius:0}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label} : ${fCHF(c.parsed.y)} CHF`}}},
      scales:{x:{stacked:true, title:{display:true,text:'Capacité de la batterie (kWh)'}, grid:{display:false}}, y:{stacked:true, ...gridY, title:{display:true,text:'CHF par an (1re année)'}}}}});
  // 3) utilisation : mois tenus, cycles
  chart('bsUse', {type:'bar', data:{labels:lab, datasets:[
      {label:'Mois où le seuil tient (sur 12)', data:a.map(x=>x.held), backgroundColor:'rgba(42,120,214,.75)', yAxisID:'y'},
      {type:'line', label:'Cycles par an', data:a.map(x=>x.cyc), borderColor:'#1baf7a', borderWidth:2, pointRadius:2, yAxisID:'y1'}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}},
      scales:{x:{title:{display:true,text:'Capacité de la batterie (kWh)'}, grid:{display:false}}, y:{...gridY, min:0, max:12, title:{display:true,text:'mois'}}, y1:{position:'right', min:0, grid:{display:false}, title:{display:true,text:'cycles / an'}}}}});
  // 4) rendement marginal : ce que rapporte chaque tranche supplémentaire
  chart('bsMarg', {type:'bar', data:{labels:lab.slice(1), datasets:[
      {label:`Gain annuel de la tranche de ${fN(BS.step)} kWh`, data:a.slice(1).map((x,k)=> (x.y1 - a[k].y1)), backgroundColor:a.slice(1).map((x,k)=> (x.y1 - a[k].y1) >= (BS.perKwh*BS.step)*(1/H + G.assur + G.maint) ? 'rgba(27,175,122,.8)' : 'rgba(179,38,30,.7)')},
      {type:'line', label:'Coût annuel de la tranche', data:a.slice(1).map(()=> BS.perKwh*BS.step*(1/H + G.assur + G.maint)), borderColor:'#1a1a19', borderDash:[5,4], borderWidth:2, pointRadius:0}]},
    options:{animation:false, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label} : ${fCHF(c.parsed.y)} CHF/an`}}},
      scales:{x:{title:{display:true,text:'Jusqu\'à (kWh)'}, grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF par an'}}}}});
  // texte
  const cur = a.reduce((p,x)=> Math.abs(x.k - v.batKwh) < Math.abs(p.k - v.batKwh) ? x : p, a[0]);
  const gB = b.cum - base.cum, gC = cur.cum - base.cum;
  document.getElementById('bsTxt').innerHTML = `
    <p><b>${v.name} · scénario ${scen().t}.</b> ${b.k === 0 ? `<b>Sans batterie, c'est le plus rentable</b> : aucune taille testée ne rapporte plus qu'elle ne coûte sur ${H} ans.` :
      `La taille la plus rentable est <b>${fN(b.k)} kWh / ${fN(b.kw)} kW</b> : <b>${gB>=0?'+':''}${fCHF(gB)} CHF</b> sur ${H} ans par rapport à sans batterie (coût ${fCHF(b.cost)} CHF, seuil ${fN(b.T)} kW tenu ${b.held} mois sur 12).`}</p>
    <p>Batterie de l'offre (${fN(v.batKwh)} kWh) : ${gC>=0?'+':''}${fCHF(gC)} CHF sur ${H} ans${cur.k !== v.batKwh ? ` (valeur la plus proche testée : ${fN(cur.k)} kWh)` : ''}.</p>
    <p class="cap">Chaque taille est simulée au quart d'heure avec son propre réglage de pilotage (seuil et réserve). Coût : ${fN(BS.perKwh)} CHF/kWh (Pylontech A1000-OMNI du fichier vert, onduleur compris) + ${fCHF(bsFixed(v))} CHF de coûts fixes propres à ${v.name.split(' · ')[0]}, pour retrouver le prix de la batterie de l'offre. Puissance = ${fN(BS.ratio,2)} × capacité. Les petites tailles ont surtout de la puissance qui manque, les grandes restent pleines une partie de l'année : au-delà de l'optimum, chaque tranche ajoutée rapporte moins qu'elle ne coûte (barres rouges du dernier graphique).</p>`;
  document.getElementById('bsTbl').innerHTML = `<thead><tr><th>Capacité</th><th>Puissance</th><th>Coût batterie</th><th>Seuil</th><th>Mois tenus</th><th>Cycles/an</th><th>Gain pointe/an</th><th>Gain total 1re année</th><th>Liquidités ${H} ans</th><th>vs sans batterie</th></tr></thead><tbody>` +
    a.map(x => `<tr class="${x===b?'hl':''}"><td>${fN(x.k)} kWh</td><td>${fN(x.kw)} kW</td><td>${fCHF(x.cost)}</td><td>${x.T?fN(x.T)+' kW':'–'}</td><td>${x.k?x.held:'–'}</td><td>${fN(x.cyc)}</td><td>${fCHF(x.sPeak-base.sPeak)}</td><td>${fCHF(x.y1-base.y1)}</td><td>${fCHF(x.cum)}</td><td class="${x.cum-base.cum<0?'neg':''}">${x.cum-base.cum>=0?'+':''}${fCHF(x.cum-base.cum)}</td></tr>`).join('') + '</tbody>';
  const sum = document.getElementById('bsSum');
  sum.innerHTML = res.map((aa,i)=>{ const bb = bsBest(aa); return `<div class="kpi" style="border-top:4px solid ${COLORS[i]}"><b>${bb.k ? fN(bb.k)+' kWh / '+fN(bb.kw)+' kW' : 'sans batterie'}</b><span>${V[i].name} · ${bb.k ? (bb.cum-aa[0].cum>=0?'+':'')+fCHF(bb.cum-aa[0].cum)+' CHF sur '+H+' ans' : 'aucune taille rentable'}</span></div>`; }).join('');
}
['perKwh','ratio','max','step'].forEach(k => { const el = document.getElementById('bs_' + k); if (el) el.onchange = () => { const x = parseFloat(el.value); if (isFinite(x) && x > 0) BS[k] = x; renderBS(true); }; });
document.getElementById('bsGo').onclick = () => { bsData = null; renderBS(true); };


/* ---------------- Configurateur : puissance, répartition RU / RUE, batterie ---------------- */
const CF = {kwc: 4200, ac: 25, bat: 500, ps: true, yAc: 1090, yRue: 1106, pKwc: 732, kwOv: null, fix: null, base: 1};
let cfRun = 0;
function cfVariant(o){
  const acKwc = o.kwc*o.ac/100, rueKwc = o.kwc - acKwc, bat = o.bat, bc = bat > 0 ? (o.fix ?? bsFixed(V[1])) + BS.perKwh*bat : 0;
  return Object.assign({}, V[o.base ?? 1], {name:'Configuration libre', acKwc, rueKwc, prodAc: acKwc*o.yAc, prodRue: rueKwc*o.yRue,
    price: o.kwc*o.pKwc + bc, batOn: bat > 0, psOn: o.ps, batKwh: bat, batKw: o.kwOv ?? Math.round(bat*BS.ratio), batReduc: bc, subCom: 0, wkFree: false});
}
function cfLabels(){
  const acK = CF.kwc*CF.ac/100;
  document.getElementById('cfKwcV').textContent = fN(CF.kwc) + ' kWc';
  document.getElementById('cfAcV').textContent = `${fN(CF.ac)} % autoconsommation (${fN(acK)} kWc) · ${fN(100-CF.ac)} % injection totale (${fN(CF.kwc-acK)} kWc)`;
  document.getElementById('cfBatV').textContent = CF.bat > 0 ? `${fN(CF.bat)} kWh / ${fN(CF.kwOv ?? CF.bat*BS.ratio)} kW` : 'sans batterie';
}
function renderCF(){
  ['kwc','ac','bat'].forEach(k => { const el = document.getElementById('cf_' + k); if (document.activeElement !== el) el.value = CF[k]; });
  ['yAc','yRue','pKwc'].forEach(k => { const el = document.getElementById('cf_' + k); if (document.activeElement !== el) el.value = CF[k]; });
  document.getElementById('cf_ps').checked = CF.ps;
  cfLabels();
  const run = ++cfRun, st = document.getElementById('cfStatus'); st.textContent = 'Calcul…';
  setTimeout(() => {
    if (run !== cfRun) return;
    const vv = cfVariant(CF), r = compute(vv), H = r.rows.length, r0 = compute(cfVariant(Object.assign({}, CF, {bat:0})));
    const warn = [];
    if (vv.rueKwc > 0 && vv.rueKwc < 150) warn.push('Injection totale sous 150 kWc : pas d\'enchère RUE possible, compter la RU ordinaire.');
    if (vv.rueKwc >= 150 && G.rueOn) warn.push(`RUE comptée à ${fN(G.rueRate)} CHF/kWc : montant à offrir à l'enchère Pronovo, non garanti.`);
    if (CF.kwc > 4201) warn.push('Au-delà de 4\'200 kWc, la toiture du photomontage ne suffit plus.');
    const k = [[fCHF(r.price)+' CHF','Prix de l\'installation'+(CF.bat?' (batterie comprise)':'')], [fCHF(r.sub)+' CHF','RU + RUE'], [fCHF(r.year1)+' CHF','Recettes 1re année'],
      [r.payback!=null ? fN(r.payback,1)+' ans' : '> '+H+' ans','Entièrement payée après'], [fCHF(r.rows[H-1].cum)+' CHF',`Liquidités à ${H} ans`],
      [fN(r.tauxAc*100,1)+' %','Autoconsommation de la partie RU'], [(r.rows[H-1].cum - r0.rows[H-1].cum >= 0 ? '+' : '') + fCHF(r.rows[H-1].cum - r0.rows[H-1].cum)+' CHF',`Effet de la batterie sur ${H} ans`],
      [fCHF(r.sPeak)+' CHF','Gain de pointe par an']];
    document.getElementById('cfKpi').innerHTML = k.map(x=>`<div class="kpi"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
    document.getElementById('cfWarn').innerHTML = warn.map(w=>`<p class="note-warn" style="margin:6px 0">${w}</p>`).join('');
    // comparaison avec V1 V2 V3
    document.getElementById('cfCmp').innerHTML = `<thead><tr><th></th><th>Configuration</th>${RES.map((x,i)=>`<th style="color:${COLORS[i]}">${x.v.name.split(' · ')[0]}</th>`).join('')}</tr></thead><tbody>` +
      [['Autoconsommation (kWc)', x=>fN(x.v.acKwc)], ['Injection totale (kWc)', x=>fN(x.v.rueKwc)], ['Batterie', x=>x.hasBat?`${fN(x.v.batKwh)} kWh / ${fN(x.v.batKw)} kW`:'aucune'],
       ['Prix (CHF)', x=>fCHF(x.price)], ['Recettes 1re année (CHF)', x=>fCHF(x.year1)], [`Liquidités à ${H} ans (CHF)`, x=>fCHF(x.rows[H-1].cum)], ['Payée après', x=>x.payback!=null?fN(x.payback,1)+' ans':'–']]
      .map(([l,f])=>`<tr><td>${l}</td><td><b>${f(r)}</b></td>${RES.map(x=>`<td>${f(x)}</td>`).join('')}</tr>`).join('') + '</tbody>';
    st.textContent = 'Calcul de la courbe de répartition…';
    // courbe : liquidités selon la part en autoconsommation, avec et sans batterie
    const parts = [0,10,20,30,40,50,60,70,80,90,100], with_ = [], without = [];
    let n = 0;
    const step = () => {
      if (run !== cfRun) return;
      const t0 = performance.now();
      while (n < parts.length && performance.now() - t0 < 120){
        const p = parts[n++];
        with_.push(compute(cfVariant(Object.assign({}, CF, {ac:p}))).rows[H-1].cum);
        without.push(compute(cfVariant(Object.assign({}, CF, {ac:p, bat:0}))).rows[H-1].cum);
      }
      if (n < parts.length){ setTimeout(step, 0); return; }
      chart('cfCurve', {type:'line', data:{labels:parts.map(p=>p+' %'), datasets:[
          {label:CF.bat ? `Avec batterie ${fN(CF.bat)} kWh` : 'Sans batterie', data:with_, borderColor:'#1c3d5a', borderWidth:2.5, pointRadius:parts.map(p=>p===Math.round(CF.ac/10)*10?6:2)},
          ...(CF.bat ? [{label:'Sans batterie', data:without, borderColor:GREY, borderDash:[5,4], borderWidth:2, pointRadius:0}] : [])]},
        options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label} : ${fCHF(c.parsed.y)} CHF`}}},
          scales:{x:{title:{display:true,text:`Part de ${fN(CF.kwc)} kWc en autoconsommation (le reste en injection totale)`}, grid:{display:false}}, y:{...gridY, title:{display:true,text:`Liquidités à ${H} ans (CHF)`}}}}});
      const bi = with_.indexOf(Math.max(...with_));
      document.getElementById('cfCurveTxt').textContent = `Pour ${fN(CF.kwc)} kWc${CF.bat?` et une batterie de ${fN(CF.bat)} kWh`:''}, la répartition la plus rentable est ${parts[bi]} % en autoconsommation (${fN(CF.kwc*parts[bi]/100)} kWc) : ${fCHF(with_[bi])} CHF à ${H} ans. ` +
        (G.rueOn ? `La RUE (${fN(G.rueRate)} CHF/kWc) pousse vers l'injection totale ; l'autoconsommation rapporte plus par kWh tant que l'usine consomme la production.` : 'RUE désactivée dans Paramètres : l\'injection totale ne reçoit que la RU ordinaire.');
      st.textContent = `Scénario ${scen().t}`;
    };
    setTimeout(step, 0);
  }, 30);
}
['kwc','ac','bat'].forEach(k => { const el = document.getElementById('cf_' + k);
  el.oninput = () => { CF[k] = +el.value; if (k === 'bat') CF.kwOv = null; cfLabels(); };
  el.onchange = () => { CF[k] = +el.value; if (k === 'bat') CF.kwOv = null; renderCF(); }; });
['yAc','yRue','pKwc'].forEach(k => { const el = document.getElementById('cf_' + k); el.onchange = () => { const x = parseFloat(el.value); if (isFinite(x) && x > 0){ CF[k] = x; renderCF(); } }; });
document.getElementById('cf_ps').onchange = e => { CF.ps = e.target.checked; renderCF(); };
document.querySelectorAll('#cfPreset button').forEach(b => b.onclick = () => { const i = +b.dataset.i, v = V[i];
  const tot = v.acKwc + v.rueKwc;
  CF.kwc = Math.round(tot); CF.ac = Math.round(v.acKwc/tot*100); CF.bat = v.batOn ? v.batKwh : 0; CF.kwOv = v.batOn ? v.batKw : null; CF.fix = bsFixed(v); CF.base = i;
  CF.yAc = Math.round(v.prodAc/v.acKwc); if (v.rueKwc > 0) CF.yRue = Math.round(v.prodRue/v.rueKwc); CF.pKwc = Math.round((v.price - v.batReduc)/tot); renderCF(); });


// Recherche de la configuration la plus rentable (liquidités à la fin de la durée choisie)
let cfOptDone = false, cfOptRun = 0, cfBest = null;
function cfOptimize(){
  const run = ++cfOptRun, st = document.getElementById('cfOptSt'), btn = document.getElementById('cfOpt');
  btn.disabled = true; st.textContent = 'Recherche…';
  const H = Math.max(1, Math.round(G.horizon)), memo = new Map();
  const val = o => { const k = [o.kwc, o.ac, o.bat].join('|'); if (!memo.has(k)) memo.set(k, compute(cfVariant(Object.assign({}, CF, o, {kwOv:null}))).rows[H-1].cum); return memo.get(k); };
  const KW = []; for (let k = 1000; k <= 4200; k += 400) KW.push(k); KW.push(4201);
  const AC = [0,10,20,30,40,50,60,70,80,90,100], BAT = []; for (let b = 0; b <= 1500; b += 100) BAT.push(b);
  let cur = {kwc: CF.kwc, ac: Math.round(CF.ac/10)*10, bat: Math.round(CF.bat/100)*100};
  const plan = [];
  for (let pass = 0; pass < 2; pass++){ plan.push(['ac', AC], ['bat', BAT], ['kwc', KW]); }
  plan.push(['ac', null], ['bat', null]); // affinage au pas de 5 % et 50 kWh autour du meilleur
  let pi = 0, list = null, li = 0, bestV = -Infinity, bestO = null, total = plan.length;
  const step = () => {
    if (run !== cfOptRun) return;
    const t0 = performance.now();
    while (pi < plan.length && performance.now() - t0 < 100){
      if (!list){
        const [k, arr] = plan[pi];
        list = arr ? arr.slice() : (k === 'ac' ? [cur.ac-5, cur.ac, cur.ac+5].filter(x=>x>=0&&x<=100) : [cur.bat-50, cur.bat, cur.bat+50].filter(x=>x>=0&&x<=1500));
        li = 0; bestV = -Infinity; bestO = null;
      }
      const k = plan[pi][0], o = Object.assign({}, cur, {[k]: list[li++]}), x = val(o);
      if (x > bestV){ bestV = x; bestO = o; }
      if (li >= list.length){ cur = bestO; list = null; pi++; }
    }
    st.textContent = pi < plan.length ? `Recherche ${Math.round(pi/total*100)} % (${memo.size} configurations testées)…` : '';
    if (pi < plan.length){ setTimeout(step, 0); return; }
    const ref = RES.map(r => r.rows[H-1].cum), bi = ref.indexOf(Math.max(...ref));
    cfBest = Object.assign({}, cur, {cum: val(cur), n: memo.size});
    Object.assign(CF, {kwc: cur.kwc, ac: cur.ac, bat: cur.bat, kwOv: null});
    btn.disabled = false; cfOptDone = true;
    const acK = cur.kwc*cur.ac/100;
    document.getElementById('cfOptTxt').innerHTML = `<b>Configuration la plus rentable trouvée</b> (${memo.size} configurations testées, scénario ${scen().t}) : <b>${fN(cur.kwc)} kWc</b>, dont <b>${fN(acK)} kWc en autoconsommation</b> (${cur.ac} %) et <b>${fN(cur.kwc-acK)} kWc en injection totale</b>, ${cur.bat ? `batterie <b>${fN(cur.bat)} kWh / ${fN(cur.bat*BS.ratio)} kW</b>` : '<b>sans batterie</b>'} → <b>${fCHF(cfBest.cum)} CHF</b> de liquidités à ${H} ans, soit ${cfBest.cum-ref[bi]>=0?'+':''}${fCHF(cfBest.cum-ref[bi])} CHF par rapport à la meilleure variante actuelle (${RES[bi].v.name.split(' · ')[0]}).
      <br><span class="cap">Les curseurs sont placés sur cette configuration : déplacez-les pour voir ce que coûte chaque écart. Critère : liquidités cumulées à ${H} ans (durée réglable dans Paramètres). ${G.rueOn ? `Hypothèse forte : RUE de ${fN(G.rueRate)} CHF/kWc obtenue à l'enchère ; désactivez la RUE dans Paramètres pour voir l'optimum sans elle.` : 'RUE désactivée : l\'injection totale ne reçoit que la RU ordinaire.'} Production par kWc et prix par kWc : valeurs des champs ci-dessous.</span>`;
    renderCF();
  };
  setTimeout(step, 0);
}
document.getElementById('cfOpt').onclick = () => cfOptimize();

/* ---------------- Navigation ---------------- */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===b));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  render();
});
document.getElementById('detDate').onchange = () => renderDetail();
document.getElementById('reset').onclick = () => { CO = [{},{},{}]; saveCO(); V = JSON.parse(JSON.stringify(DEF_VAR)); G = JSON.parse(JSON.stringify(DEF_GLOB)); tuneCache.clear(); BASE = null; save(); renderParams(); renderScen(); schedule(); };
let timer = null;
function schedule(){ document.getElementById('status').textContent = 'Calcul…'; clearTimeout(timer); timer = setTimeout(render, 60); }

/* ---------------- Rapport PDF (impression du navigateur) ---------------- */
function chartImg(cfg, w, h){
  const c = document.createElement('canvas'); c.width = w*2; c.height = h*2; c.style.width = w+'px'; c.style.height = h+'px';
  c.style.position = 'fixed'; c.style.left = '-5000px'; document.body.appendChild(c);
  cfg.options = Object.assign({}, cfg.options, {responsive:false, animation:false, devicePixelRatio:2});
  const fs = Chart.defaults.font.size; Chart.defaults.font.size = 15;
  const ch = new Chart(c, cfg); Chart.defaults.font.size = fs; const url = ch.toBase64Image('image/png', 1); ch.destroy(); c.remove(); return url;
}
function report(expert){
  const H = Math.round(G.horizon), names = RES.map(r=>r.v.name);
  const best = RES.reduce((a,b,i)=> b.npv > RES[a].npv ? i : a, 0);
  const fast = RES.reduce((a,b,i)=> (b.payback ?? 1e9) < (RES[a].payback ?? 1e9) ? i : a, 0);
  const sorted = RES.map(r=>r.npv).sort((a,b)=>b-a), gap = sorted[0]-sorted[1];
  const today = new Date().toLocaleDateString('fr-CH');
  const th = '<thead><tr><th></th>' + names.map((n,i)=>`<th style="color:${COLORS[i]}">${n}</th>`).join('') + '</tr></thead>';
  const row = (l,f,hl) => `<tr class="${hl?'hl':''}"><td>${l}</td>${RES.map(r=>`<td>${f(r)}</td>`).join('')}</tr>`;
  const bat = r => r.hasBat ? `${fN(r.v.batKwh)} kWh / ${fN(r.v.batKw)} kW${r.mode===0?'':' (sans peak shaving)'}` : 'aucune';
  const yrs = Array.from({length:H+1},(_,i)=>i);
  const imgCum = chartImg({type:'line', data:{labels:yrs, datasets:RES.map((r,i)=>({label:r.v.name, data:[-Math.min(G.fp, r.price)].concat(r.rows.map(x=>x.cum)), borderColor:COLORS[i], borderWidth:2.5, pointRadius:0}))},
    options:{plugins:{legend:{position:'bottom'}}, scales:{x:{title:{display:true,text:'Années'},grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF'}}}}}, 760, 300);
  const imgPeak = chartImg({type:'line', data:{labels:MONTHS, datasets:[{label:'Sans PV', data:Array.from(BASE.peak), borderColor:GREY, borderDash:[5,4], borderWidth:2, pointRadius:2}].concat(RES.map((r,i)=>({label:r.v.name.split(' · ')[0], data:r.peakMonths, borderColor:COLORS[i], borderWidth:2, pointRadius:2})))},
    options:{plugins:{legend:{position:'bottom'}}, scales:{x:{grid:{display:false}}, y:{...gridY, title:{display:true,text:'kW'}}}}}, 760, 260);
  const imgEn = chartImg({type:'bar', data:{labels:RES.map(r=>r.v.name.split(' · ')[0]), datasets:[
      {label:'Autoconsommé', data:RES.map(r=>r.autoconso/1000), backgroundColor:'#2a78d6'},
      {label:'Surplus revendu', data:RES.map(r=>r.surplus/1000), backgroundColor:'#eda100'},
      {label:'Injection totale (RUE)', data:RES.map(r=>r.rueProd/1000), backgroundColor:'#1baf7a'}]},
    options:{plugins:{legend:{position:'bottom'}}, scales:{x:{stacked:true,grid:{display:false}}, y:{stacked:true, ...gridY, title:{display:true,text:'MWh/an'}}}}}, 380, 260);
  const imgNpv = chartImg({type:'bar', data:{labels:RES.map(r=>r.v.name.split(' · ')[0]), datasets:[{data:RES.map(r=>r.npv), backgroundColor:COLORS}]},
    options:{plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}}, y:{...gridY, beginAtZero:true, title:{display:true,text:'CHF'}}}}}, 380, 260);

  let h = `<div class="rhead"><img src="logo-model.png" alt="Model"><div><h1>Installation photovoltaïque, Moudon</h1><div class="meta">${expert?'Rapport détaillé':'Synthèse'} · comparaison des variantes V1, V2 et V3 · ${today}</div><div class="meta">Scénario peak shaving : ${scen().t} – ${scen().d}</div></div><img class="rsolimg" src="logo-soleol.png" alt="Soleol"></div>`;
  h += `<div class="box"><b>Périodes étudiées</b><br>Consommation : courbe de charge Romande Energie au quart d'heure du <b>01.10.2025 au 30.09.2026</b> (12 mois, ${fN(BASE.imp.reduce((a,b)=>a+b,0)/1000)} MWh, pointe maximale ${fN(Math.max(...BASE.peak))} kW).<br>Réglage du pilotage de la batterie : courbe de charge du 01.01.2025 au 30.09.2025.<br>Production solaire : simulations PVsyst des variantes, réparties au quart d'heure sur la même période.</div>
  <h2>En bref</h2>
   <p>Trois variantes ont été simulées au quart d'heure sur la consommation réelle de l'usine (octobre 2025 à septembre 2026). Avec les hypothèses retenues, <b>${names[best]}</b> donne le meilleur résultat sur ${H} ans, avec ${fCHF(gap)} CHF d'avance sur la suivante. ${fast!==best ? `<b>${names[fast]}</b> est remboursée le plus vite (${fY(RES[fast].payback)}).` : `Elle est aussi remboursée le plus vite (${fY(RES[best].payback)}).`}</p>
   <div class="box"><ul>
    ${RES.map(r=>`<li><b>${r.v.name}</b> : ${fN(r.v.acKwc)} kWc en autoconsommation${r.v.rueKwc>0?` et ${fN(r.v.rueKwc)} kWc en injection totale`:''}, batterie ${bat(r)}. Investissement net ${fCHF(r.net)} CHF, entièrement payé après ${fY(r.payback)}, ${fN(r.tauxAc*100)} % de la production autoconsommée.</li>`).join('')}
   </ul></div>`;
  h += `<h2>Comparaison</h2><table>${th}<tbody>
    ${row('Puissance en autoconsommation', r=>fN(r.v.acKwc,1)+' kWc')}
    ${row('Puissance en injection totale (RUE)', r=>r.v.rueKwc>0?fN(r.v.rueKwc,1)+' kWc':'–')}
    ${row('Batterie', bat)}
    ${row('Prix de l\'offre TTC', r=>fCHF(r.price)+' CHF')}
    ${row('Subventions RU + RUE', r=>fCHF(r.sub)+' CHF')}
    ${row('Investissement net', r=>fCHF(r.net)+' CHF', 1)}
    ${row('Gain de la 1re année', r=>fCHF(r.year1)+' CHF')}
    ${row('Entièrement payé après', r=>fY(r.payback), 1)}
    ${row(`Liquidités cumulées à ${H} ans`, r=>fCHF(r.cum)+' CHF')}
    ${row('Gain net actualisé', r=>fCHF(r.npv)+' CHF', 1)}
    ${row('Taux d\'autoconsommation', r=>fN(r.tauxAc*100,1)+' %')}
    ${row('Consommation de l\'usine couverte', r=>fN(r.couverture*100,1)+' %')}
    ${row('Pointe mensuelle moyenne (sans PV : '+fN(BASE.peak.reduce((a,b)=>a+b,0)/12)+' kW)', r=>fN(r.peakAvg)+' kW')}
   </tbody></table>
   <p class="note">Gain net actualisé : tout ce que la variante rapporte sur ${H} ans, ramené à aujourd'hui (taux ${fN(G.actu*100,1)} %), subventions comprises et investissement déduit.</p>`;
  h += `<div class="keep"><h3>Quand l'installation est-elle payée ?</h3><img class="ch" src="${imgCum}"><p class="note">Chaque courbe montre l'argent cumulé une fois l'assurance, la maintenance, les intérêts et la dette payés. Les premières années, tout le cash-flow rembourse l'hypothèque (${fN(G.hyp*100,1)} %) ; la courbe monte ensuite chaque année.</p></div>`;
  h += `<h2>Production et puissance</h2><div class="two"><div><img class="ch" src="${imgEn}"><p class="note">Autoconsommé : utilisé par l'usine, directement ou via la batterie. Surplus : revendu au réseau. Injection totale : installation séparée, entièrement revendue.</p></div><div><img class="ch" src="${imgNpv}"><p class="note">Gain net actualisé sur ${H} ans.</p></div></div>
   <div class="keep"><h3>Pointe de puissance mois par mois</h3><img class="ch" src="${imgPeak}"><p class="note">La pointe la plus élevée de chaque mois est facturée ${fN(G.puiss,2)} CHF/kW. La batterie la réduit en se déchargeant au-dessus d'un seuil (peak shaving). En hiver, les pointes sont plus longues et la batterie en écrête moins.</p></div>
   <h2>Comment lire ces résultats</h2>
   <ul>
    <li><b>Autoconsommation</b> : chaque kWh utilisé par l'usine évite un achat au réseau (${fN(RES[0].v.acPrice*100,1)} ct/kWh retenu). Le surplus est revendu ${fN(G.rev*100,2)} ct/kWh.</li>
    <li><b>Injection totale (RUE)</b> : installation séparée dont toute la production est revendue ; elle reçoit une rétribution unique plus élevée (${fN(G.rueRate)} CHF/kWc${G.rueOn?', à confirmer par Pronovo':', considérée ici comme refusée'}).</li>
    <li><b>Batterie</b> : chargée uniquement par le surplus solaire ; elle garde une réserve pour écrêter les pointes et ne donne à l'usine que ce qui dépasse cette réserve.</li>
    <li>Les montants dépendent des hypothèses ci-dessous ; un changement de tarif ou de subvention peut modifier le classement.</li>
   </ul>`;
  if (expert){
    const sumP = a => a.reduce((x,y)=>x+y,0);
    h += `<div class="pb"></div><h2>Gains annuels par poste (1re année, CHF)</h2><table>${th}<tbody>
      ${row('Énergie non achetée', r=>fCHF(r.sEnergy))}${row('Puissance (pointes réduites)', r=>fCHF(r.sPeak))}${row('Énergie réactive', r=>fCHF(r.sQ))}
      ${row('Revente du surplus', r=>fCHF(r.sExp))}${row('Revente de l\'injection totale', r=>fCHF(r.sRue))}${row('Total', r=>fCHF(r.year1), 1)}
      ${row('dont apport de la batterie', r=>r.hasBat?fCHF(r.batPart):'–')}${row('Assurance + maintenance', r=>'−'+fCHF(r.dep))}</tbody></table>
     <h2>Énergie et batterie</h2><table>${th}<tbody>
      ${row('Production autoconsommation (MWh/an)', r=>fN(r.v.prodAc/1000))}${row('Production injection totale (MWh/an)', r=>fN(r.v.prodRue/1000))}
      ${row('Autoconsommé (MWh/an)', r=>fN(r.autoconso/1000))}${row('Surplus revendu (MWh/an)', r=>fN(r.surplus/1000))}
      ${row('Taux d\'autoconsommation sans / avec batterie', r=>fN(r.tauxAc0*100,1)+' % / '+fN(r.tauxAc*100,1)+' %')}
      ${row('Soutiré au réseau (MWh/an)', r=>fN(sumP(r.impMonths)/1000))}
      ${row('Seuil de pointe / réserve', r=>r.hasBat&&r.mode===0?fN(r.T)+' kW / hiver '+fN(r.R*r.cap)+' kWh, été '+fN(r.Rs*r.cap)+' kWh':'–')}
      ${row('Cycles de batterie par an', r=>r.hasBat?fN(r.cycles):'–')}</tbody></table>
     <h2>Pointes mensuelles (kW)</h2><table><thead><tr><th>Mois</th><th>Sans PV</th>${names.map((n,i)=>`<th style="color:${COLORS[i]}">${n.split(' · ')[0]}</th>`).join('')}</tr></thead><tbody>
      ${MONTHS.map((m,k)=>`<tr><td>${m}</td><td>${fN(BASE.peak[k])}</td>${RES.map(r=>`<td>${fN(r.peakMonths[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>
     <div class="pb"></div><h2>Liquidités cumulées par année (CHF)</h2><table><thead><tr><th>Année</th>${names.map((n,i)=>`<th style="color:${COLORS[i]}">${n.split(' · ')[0]} cash-flow</th><th style="color:${COLORS[i]}">${n.split(' · ')[0]} cumulé</th>`).join('')}</tr></thead><tbody>
      ${RES[0].rows.map((_,y)=>`<tr><td>${y+1}</td>${RES.map(r=>`<td>${fCHF(r.rows[y].cf)}</td><td>${fCHF(r.rows[y].cum)}</td>`).join('')}</tr>`).join('')}</tbody></table>
     <h2>Hypothèses</h2><table>${th}<tbody>
      ${VAR_FIELDS.filter(f=>f[0]!=='sec').map(f=>row(f[1], r=>f[2]===-1?(r.v[f[0]]?'oui':'non'):fN(r.v[f[0]], Math.max(f[2],0)))).join('')}</tbody></table>
     <table><tbody>${GLOB_FIELDS.filter(f=>f[0]!=='sec').map(f=>`<tr><td>${f[1]}</td><td>${f[2]===-1?(G[f[0]]?'oui':'non'):fN(G[f[0]], Math.max(f[2],0))}</td></tr>`).join('')}</tbody></table>
     <h2>Méthode et limites</h2><ul class="note">
      <li>Consommation : courbe de charge réelle au quart d'heure, octobre 2025 à septembre 2026 (3,95 GWh). Production : profil au quart d'heure calé sur les totaux PVsyst des variantes.</li>
      <li>Batterie : à chaque quart d'heure, le surplus solaire la charge ; au-dessus du seuil de pointe elle se décharge ; la réserve est gardée toute la semaine (option : libérée le week-end) ; pas de recharge sur le réseau. ${G.auto?'Seuil et réserve réglés sur janvier à septembre 2025, puis appliqués à l\'année simulée.':'Seuil et réserve fixés manuellement.'}</li>
      <li>Tarif de puissance et énergie réactive : factures Romande Energie. Prix des offres et des batteries : fichier de prix (TTC).</li>
      <li>Non compris : remplacement d'onduleurs ou de batterie, évolution des tarifs, frais de raccordement. Une seule année de consommation, reproduite sur toute la durée.</li></ul>`;
  }
  h += `<p class="note" style="margin-top:14px">Résultats calculés avec les paramètres saisis dans le simulateur le ${today}. Document indicatif, ne constitue pas une offre ferme.</p>`;
  h += `<div class="pb"></div><h2>Annexe · photomontages des variantes</h2>${RES.map((r,i)=>`<div class="pmrep"><img src="photomontage-v${i+1}.jpg" alt="Photomontage ${r.v.name}"><p class="note"><b>${r.v.name}</b> · ${PM_TXT[i]}</p></div>`).join('')}`;
  const el = document.getElementById('report'); el.innerHTML = h;
  const imgs = [...el.querySelectorAll('img')];
  Promise.all(imgs.map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; }))).then(() => setTimeout(() => window.print(), 100));
}
document.getElementById('repClient').onclick = () => report(false);
document.getElementById('repExpert').onclick = () => report(true);


/* ---------------- Actionnaire : fichiers de coûts et flux d'investissement propre ---------------- */
let actIdx = 0, xlIdx = 0;
const XL_YEARS = 30;
// Coûts de la batterie retirés du prix de revient quand la batterie est désactivée (fichier vert)
function batCostLines(i){ return i === 2 ? {51:'all', 48:20000} : {51:'all'}; }
// Valeurs modifiées dans l'onglet « Fichier Vert » (enregistrées dans le navigateur)
let CO = [{},{},{}];
try { const c = JSON.parse(localStorage.getItem('moudon_costs')); if (Array.isArray(c) && c.length === 3) CO = c; } catch (e) {}
function saveCO(){ try { localStorage.setItem('moudon_costs', JSON.stringify(CO)); } catch (e) {} }
function costData(i){
  const C0 = window.COSTS[i], o = CO[i] || {}, ol = o.lines || {};
  const C = Object.assign({}, C0, o);
  const nb = C.nb, chg = ('nb' in o) || ('prixPnx' in o) || ('wc' in o) || ('surfPnx' in o);
  if (chg){ if (!('surf' in o)) C.surf = nb*C.surfPnx; C.kwc = nb*C.wc/1000; }
  C.lines = C0.lines.map(l => { const x = Object.assign({}, l, ol[l.r] || {}); if (l.r === 18 && chg && !(ol[18] && 'p' in ol[18])) x.p = nb*C.prixPnx; return x; });
  return C;
}
function costSheet(i){
  const C = costData(i), r = RES[i], off = !r.v.batOn, rm = batCostLines(i);
  const lines = C.lines.map(l => {
    let p = l.p, fv = l.fv || 0, cut = false;
    if (off && rm[l.r] !== undefined){ if (rm[l.r] === 'all'){ p = 0; fv = 0; cut = true; } else { p = l.p - rm[l.r]; } }
    return Object.assign({}, l, {pa: p, fva: fv, cut});
  });
  const total = lines.reduce((a,l)=>a+l.pa, 0), totalFv = lines.reduce((a,l)=>a+l.fva, 0);
  const marge = r.price - total, margeFv = total - totalFv;
  return {C, lines, total, totalFv, marge, margeFv, pct: r.price ? marge/r.price : 0, pctFv: r.price ? margeFv/r.price : 0, margeCum: marge + margeFv};
}
// Case modifiable au format Excel
function xe(val, src, k, o = {}){
  const shown = typeof val === 'string' ? val : fN(val*(o.mul||1), o.d||0);
  return `<input class="xe" data-src="${src}" data-k="${k}"${o.r!=null?` data-r="${o.r}"`:''} data-mul="${o.mul||1}"${o.txt?' data-txt="1"':''} value="${String(shown).replace(/"/g,'&quot;')}" style="width:${Math.max(String(shown).length, o.w||3)+2}ch" title="Case modifiable">`;
}
function bindXe(root){
  root.querySelectorAll('input.xe').forEach(inp => {
    inp.onfocus = () => inp.select();
    inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
    inp.onchange = () => {
      const src = inp.dataset.src, k = inp.dataset.k, i = xlIdx;
      let val = inp.value;
      if (!inp.dataset.txt){
        val = parseFloat(val.replace(/[’'\s]/g,'').replace('−','-').replace(',','.'));
        if (!isFinite(val)) { schedule(); return; }
        val /= +inp.dataset.mul;
      }
      if (src === 'g'){ G[k] = val; tuneCache.clear(); BASE = null; }
      else if (src === 'v'){ V[i][k] = val; }
      else if (src === 'price'){ V[i].price = val + (V[i].batOn ? 0 : V[i].batReduc); }
      else if (src === 'c'){ CO[i][k] = val; }
      else if (src === 'cl'){ const r = +inp.dataset.r; CO[i].lines = CO[i].lines || {}; CO[i].lines[r] = Object.assign(CO[i].lines[r] || {}, {[k]: val}); }
      save(); saveCO(); renderParams(); schedule();
    };
  });
}
// Flux sur 30 ans, même logique que la feuille « Calculs » des fichiers de flux
function actFlux(i){
  const r = RES[i], v = r.v, out = [];
  const kwhAc = v.acPrice ? r.sEnergy / v.acPrice : 0;
  let debt = Math.max(r.price - G.fp, 0), cum = 0, cumV = 0, prodCum = 0, pay = null;
  for (let n = 1; n <= XL_YEARS; n++){
    const f = Math.pow(1 - G.deg, n-1);
    const vente = (r.sExp + r.sRue)*f, auto = r.sEnergy*f, puiss = v.fipPuiss === false ? 0 : r.sPeak, react = v.fipQ === false ? 0 : r.sQ*f, total = vente + auto + puiss + react;
    cumV += total; prodCum += (v.prodAc + v.prodRue)*f;
    const debtStart = debt, interet = G.hyp*debt;
    let subv = (n === Math.round(G.subYear)) ? r.sub : 0, extra = 0;
    if (subv){ const sx = Math.min(subv, debt); debt -= sx; extra = subv - sx; }
    const avail = total - r.dep - interet;
    const remb = Math.max(Math.min(debt, avail), 0); debt -= remb;
    const cf = avail - remb + extra; cum += cf;
    if (pay === null && debtStart > 0 && debt <= 1e-6) pay = n;
    out.push({n, kwc:(v.acKwc+v.rueKwc)*f, prod:(v.prodAc+v.prodRue)*f, prodCum, kwhAc:kwhAc*f, remb, subv, debt, interet, vente, auto, puiss, react, total, cumV, cf, cum});
  }
  return out;
}
const sfr = x => 'SFr. ' + fCHF(x) + '-';
function xlHeader(r, right){
  return `<div class="xlhead"><img class="xllogoimg" src="logo-soleol.png" alt="Soleol"><div class="d">${right}</div></div>`;
}
function pageFlux(i){
  const r = RES[i], v = r.v, sh = costSheet(i), C = sh.C, fl = actFlux(i), y1 = fl[0], subCom = v.subCom || 0;
  const today = new Date().toLocaleDateString('fr-CH',{day:'numeric',month:'long',year:'numeric'});
  const surf = C.nb*(C.surfPnx||2.0412), kwc = v.acKwc + v.rueKwc;
  const ass = G.assur*r.price, mnt = G.maint*r.price, depTot = y1.interet + ass + mnt;
  const prk = n => { const x = fl[n-1]; return x.prodCum ? (r.net + (ass+mnt)*n)/x.prodCum*100 : 0; };
  const kwhSold = r.surplus + v.prodRue;
  return `<div class="xlpage">${xlHeader(r, 'Calculé le : ' + today)}
   <div class="xlline"><span>Model SA à Moudon</span><span>${v.name}</span></div>
   <div class="xltitle">Flux financiers de l'installation photovoltaïque</div><div class="xlsub">avec hypothèque ${fN(G.hyp*100,1)}%</div>
   <table class="xt"><tr class="h"><td colspan="2">Données de base</td><td class="nb"></td><td class="nb"></td></tr>
    <tr><td class="l">nombre de panneaux</td><td class="c">${xe(C.nb,'c','nb')}</td><td class="nb"></td><td class="nb"></td></tr>
    <tr><td class="l">puissance des panneaux</td><td class="c">${xe(C.wc,'c','wc')} Wc</td><td class="nb"></td><td class="nb"></td></tr>
    <tr><td class="l">surface de l'installation</td><td class="c">${fN(surf)} m2</td><td class="nb"></td><td class="nb"></td></tr>
    <tr><td class="l">puissance nominale${v.rueKwc>0||i===0?'<br><span style="font-weight:400;font-size:9px">autoconso + injection totale</span>':''}</td><td class="c">${v.rueKwc>0||i===0?`${xe(v.acKwc,'v','acKwc',{d:2})} + ${xe(v.rueKwc,'v','rueKwc',{d:2})} = ${fN(kwc,2)} kWc`:`${xe(v.acKwc,'v','acKwc',{d:2})} kWc`}</td><td class="nb"></td><td class="nb"></td></tr>
    <tr><td class="l">Coût par KW (clé en main)</td><td></td><td></td><td class="r g">${sfr(r.price/kwc)}</td></tr>
    <tr><td class="l">Coût par m2 (clé en main)</td><td></td><td></td><td class="r g">${sfr(r.price/surf)}/m2</td></tr>
    <tr><td class="l">vieillissement des panneaux</td><td class="c">${xe(G.deg,'g','deg',{mul:100,d:2})}% par an</td><td colspan="2" style="font-size:9.5px">(≈ ${fN(Math.pow(1-G.deg,25)*100)}% de puissance restante après 25 ans)</td></tr>
    <tr><td class="l">Production en 1ère année${v.rueKwc>0||i===0?'<br><span style="font-weight:400;font-size:9px">autoconso + injection totale</span>':''}</td><td class="c">${v.rueKwc>0||i===0?`${xe(v.prodAc,'v','prodAc')} + ${xe(v.prodRue,'v','prodRue')} = ${fN(v.prodAc+v.prodRue)} kWh`:`${xe(v.prodAc,'v','prodAc')} kWh`}</td><td colspan="2" style="font-size:9.5px">(PVsyst)</td></tr>
    <tr><td class="l">Batterie</td><td class="c">${v.batOn?`${xe(v.batKwh,'v','batKwh')} kWh / ${xe(v.batKw,'v','batKw')} kW`:'aucune'}</td><td colspan="2" style="font-size:9.5px">${r.hasBat?(r.mode?'sans peak shaving':'avec peak shaving'):''}</td></tr>
    <tr class="t"><td class="nb"></td><td colspan="2" class="r">Total à financer (TVA comprise)</td><td class="r">SFr. ${xe(r.price,'price','price',{w:9})}</td></tr></table>
   <table class="xt"><tr class="h"><td>FINANCEMENT</td><td class="c">intérêts</td><td class="c">remboursement</td><td class="c">montant</td></tr>
    <tr><td><b>Rétribution unique touchée</b>${v.rueKwc>0?(G.rueOn?' (RU + RUE)':' (RU, RUE refusée)'):' (RU)'}</td><td class="bk"></td><td class="bk"></td><td class="r">${sfr(r.sub - subCom)}</td></tr>
    <tr><td><b>Subvention communale</b></td><td class="c">0.0%</td><td class="c">0.0%</td><td class="r">SFr. ${xe(subCom,'v','subCom',{w:7})}</td></tr>
    <tr><td><b>Fonds propres</b></td><td class="bk"></td><td class="c">0.0%</td><td class="r">SFr. ${xe(G.fp,'g','fp',{w:7})}</td></tr>
    <tr><td><b>hypothèque/Leasing</b></td><td class="c">${xe(G.hyp,'g','hyp',{mul:100,d:2})}%</td><td class="c g">max. possible</td><td class="r">${sfr(Math.max(r.net - G.fp,0))}</td></tr>
    <tr class="t"><td class="nb"></td><td colspan="2" class="r">Total sources de financement</td><td class="r">${sfr(r.price)}</td></tr></table>
   <table class="xt"><tr class="h"><td>DEPENSES (1ère année)</td><td class="c">intérêts</td><td class="c">remboursement</td><td class="c">TOTAL</td></tr>
    <tr><td><b>Subvention communale</b></td><td class="r">SFr. 0-</td><td class="r">SFr. 0-</td><td class="r">SFr. 0-</td></tr>
    <tr><td><b>Fonds propres</b></td><td class="bk"></td><td class="r">SFr. 0-</td><td class="r">SFr. 0-</td></tr>
    <tr><td><b>hypothèque/Leasing</b></td><td class="r">${sfr(y1.interet)}</td><td class="c g">max. possible</td><td class="r">${sfr(y1.interet)}</td></tr></table>
   <table class="xt"><tr><td><b>assurances</b></td><td class="c">${xe(G.assur,'g','assur',{mul:100,d:2})}%</td><td></td><td class="r">${sfr(ass)}</td></tr>
    <tr><td><b>réserve annuelle pour maintenance</b></td><td class="c">${xe(G.maint,'g','maint',{mul:100,d:2})}%</td><td></td><td class="r">${sfr(mnt)}</td></tr>
    <tr class="t"><td class="nb"></td><td colspan="2" class="r">Total des dépenses annuelles</td><td class="r">${sfr(depTot)}</td></tr></table>
   <table class="xt"><tr class="h"><td>RECETTES</td><td class="c">Prix de vente</td><td class="c">Montant</td></tr>
    <tr><td class="r">ventes annuelle d'électricité (${fN(kwhSold)} kWh/an)</td><td class="c">${xe(G.rev,'g','rev',{mul:100,d:2})} Cts/kWh</td><td class="r">${sfr(y1.vente)}</td></tr>
    <tr><td class="r">auto-consommation de ${fN(r.tauxAc*100,1)}% (${fN(y1.kwhAc)} kWh/an), calculée à</td><td class="c">${xe(v.acPrice,'v','acPrice',{mul:100,d:2})} Cts/kWh</td><td class="r">${sfr(y1.auto)}</td></tr>
    ${v.fipPuiss===false?'':`<tr><td class="r">réduction de la puissance de pointe${r.hasBat&&r.mode===0?' (peak shaving)':''}</td><td class="c">${xe(G.puiss,'g','puiss',{d:2})} SFr./kW/mois</td><td class="r">${sfr(y1.puiss)}</td></tr>`}
    ${v.fipQ===false?'':`<tr><td class="r">énergie réactive (franchise réduite)</td><td class="c">${xe(G.prixQ,'g','prixQ',{mul:100,d:2})} Cts/kvarh</td><td class="r">${sfr(y1.react)}</td></tr>`}
    <tr class="t"><td class="nb"></td><td class="r">TOTAL</td><td class="r">${sfr(y1.total)}</td></tr></table>
   <div class="xcfh">Disponible pour rembourser la dette ou autre (CASH-FLOW)</div>
   <div class="xcf"><span>économie/vente d'électricité</span><span>${sfr(y1.total)}</span><span>dépenses totales</span><span>${sfr(depTot)}</span>
     <b style="text-align:right">SOLDE (cash-flow)</b><b>${sfr(y1.total - depTot)}</b></div>
   <div style="text-align:right;margin-top:-34px"><span style="font-weight:700;font-size:11px">Rendement brut</span><br><span style="display:inline-block;background:#c6efce;border:1px solid #000;padding:1px 14px;font-size:11px">${fN(r.net>0?y1.total/r.net*100:0,2)}%</span></div>
   <div class="xprk"><span>Prix de revient moyen du kWh sur 20, 25 et 30 ans<br>(remboursement de l'emprunt compris)</span><b>${fN(prk(20),2)} cts/kWh || ${fN(prk(25),2)} cts/kWh || ${fN(prk(30),2)} cts/kWh</b></div>
   <div class="xfoot">Collaborateur Soleol HBA · autoconsommation et peak shaving simulés au quart d'heure (01.10.2025–30.09.2026)</div></div>`;
}
function pageGraph(i){
  const r = RES[i], v = r.v, fl = actFlux(i), C = window.COSTS[i];
  const surf = C.nb*(C.surfPnx||2.0412), y20 = fl[19].cum;
  return `<div class="xlpage">${xlHeader(r, `Model SA à Moudon ${v.name} ${new Date().toLocaleDateString('fr-CH',{day:'numeric',month:'long',year:'numeric'})}`)}
   <div class="xgbox"><div class="xgtitle">Cash-flow annuel :<br>toutes les liquidités dégagées les premières années sont utilisées pour rembourser intégralement la dette</div><canvas id="xgCf${i}" height="230"></canvas></div>
   <div class="xgbox"><div class="xgtitle" style="text-align:left;margin-left:50px">liquidités cumulées</div><canvas id="xgLq${i}" height="250"></canvas></div>
   <div class="xliq">Liquidités cumulées avec subvention unique,<br>investissement ENTIÈREMENT payé${fl.find(x=>x.debt<=1e-6)?` (après ${fl.find(x=>x.debt<=1e-6).n} ans)`:''}</div>
   <div class="xliq" style="margin-top:6px">20 ans <span class="bx">${sfr(y20)}</span> soit ${sfr(y20/surf)}/m2</div>
   <div class="xfoot">Collaborateur Soleol HBA</div></div>`;
}
function pageCost(i){
  const r = RES[i], sh = costSheet(i), C = sh.C;
  const rw = (a,b,c,d,e,cls='') => `<tr class="${cls}"><td>${a}</td><td class="r">${b??''}</td><td class="r">${c??''}</td><td class="r">${d??''}</td><td class="n">${e??''}</td></tr>`;
  let t = `<table class="vt">
    <tr><td>Nom : Model SA à 1510 Moudon</td><td colspan="3" class="st">${C.statut}</td><td></td></tr>
    <tr><td>N° chantier</td><td colspan="3" style="font-weight:700;text-align:center">${C.type}</td><td></td></tr>
    <tr class="gr"><td>${C.titre.replace(/\s+/g,' ')}</td><td>FFZ</td><td>${C.date}</td><td></td><td></td></tr>
    ${rw('marque panneau','',xe(C.panneau,'c','panneau',{txt:1}),'',C.notes[0])}${rw('puissance panneau (Wc)','',xe(C.wc,'c','wc'),'',C.notes[1])}
    ${rw('prix panneau TTC (CHF)','',xe(C.prixPnx,'c','prixPnx',{d:2}),'',C.notes[2])}${rw('surface panneau (m2)','',xe(C.surfPnx,'c','surfPnx',{d:4}),'',C.notes[3])}
    ${rw('surface utilisée (m2)','',xe(C.surf,'c','surf',{d:2}),'',C.notes[4])}${rw('nombre panneaux','',xe(C.nb,'c','nb'),'',(C.notes[5]||'')+(C.notes[6]?' · '+C.notes[6]:''))}
    ${rw('puissance nominale (kW)','',fN(C.kwc,2),'',C.notes[7]||'')}
    <tr class="gr"><td>PRIX CLIENT</td><td></td><td></td><td>Marge brute totale</td><td></td></tr>
    ${rw('prix clé en main TTC (CHF/kWc)','',fN(r.price/C.kwc,0),'','')}
    <tr class="yl"><td>prix total clé en main (chf)</td><td></td><td class="r">${xe(r.price,'price','price',{w:9})}</td><td class="r k">${fCHF(r.price)}</td><td class="n">Prix à mettre dans l'offre${r.v.batOn?'':' (sans batterie)'}</td></tr>
    <tr class="gr"><td>PRIX DE REVIENT</td><td>Quantité</td><td>Prix retenu</td><td>FV prédit</td><td>Remarque</td></tr>`;
  t += sh.lines.map(l => {
    const mod = l.pa !== l.p && !l.cut;
    const cq = l.cut ? (l.q ?? '') : xe(l.q ?? '', 'cl', 'q', {r:l.r, w:3});
    const cp = l.cut ? fCHF(l.pa) : xe(l.p, 'cl', 'p', {r:l.r, w:7}) + (mod ? ' *' : '');
    const cf = l.cut ? fCHF(l.fva) : xe(l.fv || 0, 'cl', 'fv', {r:l.r, w:7});
    return rw(l.l, cq, cp, cf, l.n + (mod ? ' (* sans batterie : ' + fCHF(l.pa) + ', génie civil batterie retiré)' : '') + (l.cut ? ' (batterie désactivée)' : ''), l.cut ? 'off' : '');
  }).join('');
  t += rw('Total Coûts TTC','',fCHF(sh.total),fCHF(sh.totalFv),'','b') +
    `<tr class="gr"><td>MARGE</td><td></td><td></td><td>MARGE</td><td></td></tr>` +
    rw('Différence prix total-prix revient (chf)','',fCHF(sh.marge),fCHF(sh.margeFv),'','b') +
    rw('marge (%)','',fN(sh.pct*100,2),fN(sh.pctFv*100,2),'') +
    rw('Marge cumulée, en CHF','',fCHF(sh.margeCum),'','') + rw('Marge cumulée, en %','',fN(r.price?sh.margeCum/r.price*100:0,2),'','') + '</table>';
  return `<div class="xlpage wide"><div style="font:700 13px Arial;margin-bottom:6px">Fichier Vert · ${r.v.name}</div><div class="tablewrap">${t}</div></div>`;
}
const barLabels = {id:'barLabels', afterDatasetsDraw(ch, a, o){ const ds = ch.data.datasets[0], m = ch.getDatasetMeta(0), ctx = ch.ctx; if (!o || !o.idx) return;
  ctx.save(); ctx.font = '10px Arial'; ctx.fillStyle = '#000'; ctx.textAlign = 'center';
  o.idx.forEach(k => { const el = m.data[k]; if (!el) return; const t = 'SFr. ' + fCHF(ds.data[k]), w = ctx.measureText(t).width; const x = Math.min(el.x, ch.chartArea.right - w/2); ctx.fillStyle = '#fff'; ctx.fillRect(x - w/2 - 2, el.y - 26, w + 4, 13); ctx.fillStyle = '#000'; ctx.fillText(t, x, el.y - 16); ctx.beginPath(); ctx.moveTo(el.x, el.y - 12); ctx.lineTo(el.x, el.y - 2); ctx.stroke(); }); ctx.restore(); }};
function drawXlCharts(i){
  const fl = actFlux(i), lab = fl.map(x=>x.n);
  const opt = (lbl) => ({layout:{padding:{top:22, right:10}}, plugins:{legend:{display:false}, tooltip:tipCHF, barLabels:lbl}, scales:{x:{grid:{display:false}, ticks:{font:{size:9}}}, y:{grid:{color:'#000', lineWidth:.4}, ticks:{callback:v=>'SFr. '+fN(v)}}}});
  chart('xgCf'+i, {type:'bar', data:{labels:lab, datasets:[{data:fl.map(x=>x.cf), backgroundColor:'#1a1a1a', barPercentage:.35}]}, options:opt({}), plugins:[barLabels]});
  chart('xgLq'+i, {type:'bar', data:{labels:lab, datasets:[{data:fl.map(x=>x.cum), backgroundColor:fl.map(x=>[20,25,30].includes(x.n)?'#6ec6f0':'#1a1a1a'), borderColor:'#1a1a1a', borderWidth:fl.map(x=>[20,25,30].includes(x.n)?1:0), barPercentage:.45}]}, options:opt({idx:[19,24,29]}), plugins:[barLabels]});
}
function renderAct(){
  const H = Math.round(G.horizon), sheets = RES.map((_,i)=>costSheet(i));
  const th = '<thead><tr><th></th>' + RES.map((r,i)=>`<th style="color:${COLORS[i]}">${r.v.name}</th>`).join('') + '</tr></thead>';
  const row = (l,f,hl) => `<tr class="${hl?'hl':''}"><td>${l}</td>${RES.map((r,i)=>`<td>${f(r,i)}</td>`).join('')}</tr>`;
  const F = RES.map((_,i)=>actFlux(i));
  document.getElementById('actSum').innerHTML = th + '<tbody>' +
    row('Batterie', r=> r.hasBat ? `${fN(r.v.batKwh)} kWh / ${fN(r.v.batKw)} kW${r.mode? ' (sans peak shaving)':''}` : 'aucune') +
    row('Prix de l\'offre TTC (CHF)', r=>fCHF(r.price)) + row('Prix de revient TTC (CHF)', (r,i)=>fCHF(sheets[i].total)) +
    row('Marge (CHF / %)', (r,i)=>fCHF(sheets[i].marge)+' / '+fN(sheets[i].pct*100,2)+' %', 1) +
    row('Rétribution unique (CHF)', r=>fCHF(r.sub)) + row('Hypothèque (CHF)', r=>fCHF(r.net)) +
    row('Recettes 1re année (CHF)', (r,i)=>fCHF(F[i][0].total)) + row('Taux d\'autoconsommation (simulé)', r=>fN(r.tauxAc*100,1)+' %') +
    row('Investissement entièrement payé après', (r,i)=>{ const x = F[i].find(y=>y.debt<=1e-6); return x ? x.n+' ans' : '> 30 ans'; }, 1) +
    row('Liquidités cumulées à 20 / 25 / 30 ans (CHF)', (r,i)=>[19,24,29].map(k=>fCHF(F[i][k].cum)).join(' / '), 1) + '</tbody>';
  segs('actSel', actIdx, i => { actIdx = i; renderAct(); });
  togs('actTog', actIdx);
  renderXl();
}
function togs(id, i, lines){
  const v = V[i], el = document.getElementById(id);
  el.innerHTML = (lines ? `<label class="sw" title="Ligne « réduction de la puissance de pointe » dans les recettes"><input type="checkbox" data-k="fipPuiss" ${v.fipPuiss!==false?'checked':''}><span class="k"></span>Ligne puissance de pointe</label>
     <label class="sw" title="Ligne « énergie réactive » dans les recettes (coût dû à la franchise réduite)"><input type="checkbox" data-k="fipQ" ${v.fipQ!==false?'checked':''}><span class="k"></span>Ligne énergie réactive</label>` : '') + `<label class="sw"><input type="checkbox" data-k="batOn" ${v.batOn?'checked':''}><span class="k"></span>Batterie</label>
     <label class="sw"><input type="checkbox" data-k="psOn" ${v.psOn?'checked':''} ${v.batOn?'':'disabled'}><span class="k"></span>Peak shaving</label>`;
  el.querySelectorAll('input').forEach(inp => inp.onchange = e => { V[i][e.target.dataset.k] = e.target.checked; save(); schedule(); });
}
// Onglets « Fichier Vert » et « Flux Inv. propre » : mêmes feuilles que les fichiers Excel, cases modifiables
function renderXl(){
  ['vert','fip'].forEach(t => { segs(t + 'Sel', xlIdx, i => { xlIdx = i; renderXl(); }); togs(t + 'Tog', xlIdx, t === 'fip'); });
  ['xgCf0','xgLq0','xgCf1','xgLq1','xgCf2','xgLq2'].forEach(id => { if (CH[id]) { CH[id].destroy(); delete CH[id]; } });
  const pv = document.getElementById('vertPages'), pf = document.getElementById('fipPages');
  pv.innerHTML = pageCost(xlIdx);
  pf.innerHTML = pageFlux(xlIdx) + pageGraph(xlIdx);
  drawXlCharts(xlIdx);
  bindXe(pv); bindXe(pf);
}
function reportAct(only){
  if (typeof only !== 'number') only = null;
  const today = new Date().toLocaleDateString('fr-CH');
  let h = `<div class="rhead"><img src="logo-model.png" alt="Model"><div><h1>Installation photovoltaïque, Moudon</h1><div class="meta">Dossier actionnaire${only!==null?' · '+RES[only].v.name:''} · ${today} · document interne</div><div class="meta">Scénario peak shaving : ${scen().t} – ${scen().d}</div></div><img class="rsolimg" src="logo-soleol.png" alt="Soleol"></div>
   <div class="box"><b>Périodes étudiées</b><br>Consommation : courbe de charge au quart d'heure du <b>01.10.2025 au 30.09.2026</b>. Réglage du pilotage de la batterie : 01.01.2025 au 30.09.2025. Production : simulations PVsyst des variantes. Coûts : fichier de prix du 18.11.2026.</div>
   <h2>Synthèse des trois variantes</h2><table>${document.getElementById('actSum').innerHTML}</table>
   <p class="note">Les pages suivantes reprennent la présentation des fichiers Excel : Tableau client (flux financiers), Graph (cash-flow et liquidités cumulées) et Fichier Vert (coûts et marge)${only!==null?' pour '+RES[only].v.name:' pour chaque variante'}.</p>`;
  let pmAnnex = '';
  RES.forEach((r,i) => {
    if (only !== null && i !== only) return;
    const fl = actFlux(i);
    const mk = (data, colors, idx) => chartImg({type:'bar', data:{labels:fl.map(x=>x.n), datasets:[{data, backgroundColor:colors, barPercentage:.45}]}, options:{layout:{padding:{top:22, right:10}}, plugins:{legend:{display:false}, barLabels:{idx}}, scales:{x:{grid:{display:false}}, y:{grid:{color:'#000',lineWidth:.4}, ticks:{callback:v=>'SFr. '+fN(v)}}}}, plugins:[barLabels]}, 640, 300);
    const g = pageGraph(i).replace(`<canvas id="xgCf${i}" height="230"></canvas>`, `<img class="ch" src="${mk(fl.map(x=>x.cf), '#1a1a1a', [])}">`)
                          .replace(`<canvas id="xgLq${i}" height="250"></canvas>`, `<img class="ch" src="${mk(fl.map(x=>x.cum), fl.map(x=>[20,25,30].includes(x.n)?'#6ec6f0':'#1a1a1a'), [19,24,29])}">`);
    h += `${pageFlux(i)}${g}${pageCost(i)}`;
    pmAnnex += `<div class="pmpage"><h2>Annexe · photomontage ${r.v.name}</h2><img src="photomontage-v${i+1}.jpg" alt="Photomontage ${r.v.name}"><p class="note">${PM_TXT[i]}</p></div>`;
  });
  h += pmAnnex;
  const el = document.getElementById('report'); el.innerHTML = h.replace(/<input class="xe"[^>]*value="([^"]*)"[^>]*>/g, '$1');
  const imgs = [...el.querySelectorAll('img')];
  Promise.all(imgs.map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; }))).then(() => setTimeout(() => window.print(), 100));
}
const PM_TXT = [`Injection totale 3'195,3 kWc (sheds est-ouest et toits sud-ouest) + autoconsommation 1'005,5 kWc (sheds sud-ouest S43.2–S76), 8'573 modules Longisolar 490 W.`,
  `Toute la toiture en autoconsommation : 4'200,8 kWc, 8'573 modules Longisolar 490 W, 17'499 m².`,
  `Autoconsommation avec moins de panneaux : 2'912,1 kWc, 5'943 modules Longisolar 490 W, 12'131 m².`];
function renderPM(){
  const el = document.getElementById('pmGal'); if (!el) return;
  el.innerHTML = V.map((v,i)=>`<figure class="pm"><img src="photomontage-v${i+1}.jpg" alt="Photomontage ${v.name}" data-i="${i}" loading="lazy"><figcaption><b style="color:${COLORS[i]}">${v.name}</b><br>${PM_TXT[i]}</figcaption></figure>`).join('');
  el.querySelectorAll('img').forEach(im => im.onclick = () => { const lb = document.getElementById('lb'); lb.querySelector('img').src = im.src; lb.querySelector('p').textContent = V[+im.dataset.i].name + ' · ' + PM_TXT[+im.dataset.i]; lb.classList.add('on'); });
}
renderPM();
document.getElementById('lb').onclick = () => document.getElementById('lb').classList.remove('on');
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('lb').classList.remove('on'); });
function renderScen(){ const el = document.getElementById('psScen'); if (!el) return;
  el.innerHTML = Object.entries(PS_SCEN).map(([k,o]) => `<button data-s="${k}" class="${G.psScen===k?'on':''}" title="${o.d.replace(/"/g,'&quot;')}">${o.t}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { G.psScen = b.dataset.s; save(); renderScen(); renderParams(); schedule(); }); }
renderScen();
document.getElementById('repAct').onclick = reportAct;
document.getElementById('fipPdf').onclick = () => reportAct(xlIdx);
document.getElementById('vertPdf').onclick = () => reportAct(xlIdx);
document.getElementById('fipPdfAll').onclick = () => reportAct();
document.getElementById('vertPdfAll').onclick = () => reportAct();
document.getElementById('vertReset').onclick = () => { CO[xlIdx] = {}; saveCO(); schedule(); };
document.getElementById('fipReset').onclick = () => {
  const d = DEF_VAR[xlIdx]; ['acKwc','rueKwc','prodAc','prodRue','batKwh','batKw','price','acPrice','subCom'].forEach(k => { V[xlIdx][k] = d[k] || 0; });
  ['deg','fp','hyp','assur','maint','rev','puiss','prixQ'].forEach(k => { G[k] = DEF_GLOB[k]; }); delete V[xlIdx].fipPuiss; delete V[xlIdx].fipQ;
  tuneCache.clear(); BASE = null; save(); renderParams(); renderScen(); schedule(); };

bindTips(document);
renderParams();
render();
