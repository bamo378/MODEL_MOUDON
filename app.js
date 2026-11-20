/* Simulateur PV + batterie – Model SA, Moudon
   Simulation au quart d'heure sur la courbe de charge réelle (01.10.2025 → 30.09.2026).
   Pilotage de la batterie et financement repris de l'étude ; voir les bulles ⓘ. */
'use strict';
const D = window.DATA;
const DT = 0.25;
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
const COLOR_OPT = '#c08a00';
let RES_OPT = null, RES_OPT_KEY = null;
const CMP = () => RES_OPT ? RES.concat([RES_OPT]) : RES;
const CMPC = () => RES_OPT ? COLORS.concat([COLOR_OPT]) : COLORS;
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
  usable:0.88, eta:0.938, auto:true, gridChg:false, psScen:'real', pilot:'saison'};

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
  ['Ts','Seuil de pointe visé en été, avr.–sept. (kW)',0,'Seuil utilisé d\'avril à septembre, quand le surplus solaire remplit la batterie chaque jour. Utilisé si le réglage automatique est désactivé.'],
  ['T','Seuil de pointe visé en hiver, oct.–mars (kW)',0,'Au-dessus de ce soutirage, la batterie se décharge pour écrêter la pointe. Si une pointe plus haute passe quand même, le seuil remonte jusqu\'à la fin du mois. Utilisé si le réglage automatique est désactivé.'],
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
  ['gridChg','Recharge de la batterie sur le réseau (valeur par défaut)',-1,'Valeur par défaut des trois variantes ; chaque variante a aussi son bouton « Recharge réseau ». Désactivé : la batterie se charge uniquement avec le surplus solaire de la partie autoconsommation, jamais sur le réseau. Activé : elle peut se recharger sur le réseau jusqu\'à sa réserve, quand l\'usine est bien sous le seuil de pointe.'],
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
  const m = new Uint8Array(n), wk = new Uint8Array(n), su = new Uint8Array(n), cm = new Uint8Array(n);
  for (let i = 0; i < n; i++){
    const d = new Date(t0 + i*900000), h = d.getUTCHours() + d.getUTCMinutes()/60, w = d.getUTCDay();
    m[i] = testYear ? (d.getUTCFullYear()-2025)*12 + d.getUTCMonth() - 9 : d.getUTCMonth();
    cm[i] = d.getUTCMonth();
    su[i] = (d.getUTCMonth() >= 3 && d.getUTCMonth() <= 8) ? 1 : 0; // été : avril à septembre
    wk[i] = ((w === 5 && h >= 22) || w === 6 || (w === 0 && h < 20)) ? 1 : 0;
  }
  return {n, t0, load: Float64Array.from(load), pv: Float64Array.from(pv, x => x/1e7), m, wk, su, cm, nm: testYear ? 12 : 9};
}
const YEAR = series(D.start, D.n, D.load, D.pv, true);
const CAL = series(D.calStart, D.calN, D.calLoad, D.calPv, false);

/* ---------------- Simulation quart d'heure ---------------- */
let GRIDC = false; // recharge de la batterie sur le réseau (bouton par variante)
let WKF = false; // réserve libérée le week-end (option par variante, désactivée par défaut)
function sim(S, prod, cap, pw, T0, R, eta, mode, keep){
  const Rw = Array.isArray(R) ? R[0] : R, Rs = Array.isArray(R) ? R[1] : R; // réserve hiver (oct.–mars) / été (avr.–sept.)
  // mode 0 : peak shaving + autoconsommation ; mode 1 : autoconsommation seule
  const n = S.n, nm = S.nm, SC = mode ? {m:0, o:0} : scen();
  const peak = new Float64Array(nm), imp = new Float64Array(nm);
  const T0c = (T0 && T0.cal) ? T0.cal : null; // seuils par mois civil (janv. = 0)
  const T0w = T0c ? T0c[0] : Array.isArray(T0) ? T0[0] : T0, T0s = T0c ? T0c[6] : Array.isArray(T0) ? T0[1] : T0; // seuil hiver / été
  let soc = cap*0.5, T = mode ? Infinity : T0w, cur = -1, exp = 0, dis = 0, chg = 0, gchg = 0;
  const grid = keep ? new Float32Array(n) : null, socA = keep ? new Float32Array(n) : null;
  const cA = keep ? new Float32Array(n) : null, dA = keep ? new Float32Array(n) : null, kA = keep ? new Uint8Array(n) : null, TA = keep ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++){
    if (S.m[i] !== cur){ cur = S.m[i]; T = mode ? Infinity : (T0c ? T0c[S.cm[i]] : (S.su[i] ? T0s : T0w)); }
    const x = S.load[i] - prod*S.pv[i];
    let c = 0, d = 0, kind = 0, f = 1; // kind : 1 charge solaire, 2 charge réseau, 3 décharge pointe, 4 décharge autoconso
    if (keep) TA[i] = T;
    if (cap > 0){
      const res = ((S.wk[i] && WKF) || mode) ? 0 : (S.su[i] ? Rs : Rw)*cap;
      if (x < 0){ c = Math.min(-x, pw, (cap-soc)/(eta*DT)); kind = 1; }
      else if (x > T - SC.m){ f = 1 + SC.o; d = Math.min(x-(T-SC.m), pw, soc*eta/(f*DT)); kind = 3; }
      else if (soc > res){ d = Math.min(x, pw, (soc-res)*eta/DT); kind = 4; }
      else if (GRIDC && soc < res && x < T-100){ c = Math.min(T-50-x, pw, (res-soc)/(eta*DT)); gchg += c*DT; kind = 2; }
      soc += c*eta*DT - d*f/eta*DT;
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
// Types de pilotage : seuil fixe, hiver / été, par mois, référence (connaît l'année simulée)
const PILOT = {
  fixe:   {t:'Seuil fixe', d:'Un seul seuil réglé à la mise en service, toute l\'année.'},
  saison: {t:'Hiver / été', d:'Deux seuils, changés deux fois par an (avril et octobre).'},
  mois:   {t:'Par mois', d:'Un seuil pour chaque mois, réglé par l\'installateur ou l\'EMS à partir de l\'année précédente.'},
  ref:    {t:'Référence', d:'Seuils par mois choisis en connaissant toute l\'année simulée à l\'avance : impossible en vrai, sert de plafond théorique.'}};
const pilot = () => PILOT[G.pilot] ? G.pilot : 'saison';
function tune(prodPerKwh, cap, pw, ac){
  const P = pilot(), key = [prodPerKwh, cap, pw, ac, WKF, G.puiss, G.rev, G.prixQ, G.eta, GRIDC, G.psScen, P].join('|');
  if (tuneCache.has(key)) return tuneCache.get(key);
  // Réglage sur une période passée (janv.–sept. 2025), sauf la référence qui connaît l'année simulée
  const S = P === 'ref' ? YEAR : CAL, Q = P === 'ref' ? Q_KVARH : Q_CAL;
  const cost = (T, R) => annualCost(sim(S, prodPerKwh, cap, pw, T, R, G.eta, 0, false), ac, Q);
  let best = null;
  for (let T = 520; T <= 960; T += 10) for (const R of [0.2,0.4,0.6,0.8,1]){
    const c = cost(T, R); if (!best || c < best.c) best = {c, T, R, Rs: R};
  }
  // Réserve d'été : abaissée seulement si le gain est net (> 100 CHF/an sur la période de réglage)
  let bs = best;
  for (const Rs of [0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1]){ const c = cost(best.T, [best.R, Rs]); if (c < bs.c - 1e-6) bs = {c, T: best.T, R: best.R, Rs}; }
  if (best.c - bs.c > 100) best = bs;
  best.Ts = best.T;
  if (P !== 'fixe'){
    // Seuil d'été séparé : en été le soleil remplit la batterie chaque jour, elle peut viser plus bas
    for (let pass = 0; pass < 2; pass++){
      for (let Ts = 400; Ts <= 960; Ts += 10){ const c = cost([best.T, Ts], [best.R, best.Rs]); if (c < best.c - 1e-6) best = Object.assign({}, best, {c, Ts}); }
      for (let Tw = 520; Tw <= 960; Tw += 10){ const c = cost([Tw, best.Ts], [best.R, best.Rs]); if (c < best.c - 1e-6) best = Object.assign({}, best, {c, T: Tw}); }
    }
  }
  if (P === 'mois' || P === 'ref'){
    // Un seuil par mois civil ; les mois absents de la période de réglage (oct.–déc.) gardent le seuil d'hiver
    const cal = Array.from({length:12}, (_,m) => (m >= 3 && m <= 8) ? best.Ts : best.T);
    const months = P === 'ref' ? [0,1,2,3,4,5,6,7,8,9,10,11] : [0,1,2,3,4,5,6,7,8];
    let c0 = cost({cal}, [best.R, best.Rs]);
    for (let pass = 0; pass < 2; pass++) for (const m of months){
      const base = cal[m];
      for (let t = Math.max(400, base - 150); t <= Math.min(1000, base + 150); t += 10){
        if (t === base) continue;
        const c2 = cal.slice(); c2[m] = t; const c = cost({cal: c2}, [best.R, best.Rs]);
        if (c < c0 - 1e-6){ c0 = c; cal[m] = t; }
      }
    }
    best = Object.assign({}, best, {c: c0, cal});
  }
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
  let T = v.T, Ts = v.Ts ?? v.T, R = v.R, Rs = v.Rs ?? v.R, Tcal = v.Tcal || null;
  const mode = (hasBat && v.psOn) ? 0 : 1;
  WKF = v.wkFree === true;
  GRIDC = (v.gridChg ?? G.gridChg) === true;
  if (hasBat && v.psOn && G.auto){ const t = tune(v.prodAc, cap, pw, v.acPrice); T = t.T; Ts = t.Ts ?? t.T; R = t.R; Rs = t.Rs; Tcal = t.cal || null; }
  const r = sim(YEAR, v.prodAc, cap, pw, Tcal ? {cal: Tcal} : [T, Ts], [R, Rs], G.eta, mode, true);
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
  return {v, hasBat, mode, T, Ts, Tm: Array.from({length:12}, (_,k) => Tcal ? Tcal[(k + 9) % 12] : (k >= 6 ? Ts : T)), Tcal, R, Rs, cap, r, price, sub, net, dep, sEnergy, sPeak, sQ, sExp, sRue, batPart,
    year1: sEnergy + sPeak + sQ + sExp + sRue, autoconso: v.prodAc - r.exp,
    tauxAc: v.prodAc > 0 ? (v.prodAc - r.exp)/v.prodAc : 0, tauxAc0: v.prodAc > 0 ? (v.prodAc - r0.exp)/v.prodAc : 0,
    couverture: (v.prodAc - r.exp)/(sum(BASE.imp)), tauxTot: (v.prodAc + v.prodRue) > 0 ? (v.prodAc - r.exp)/(v.prodAc + v.prodRue) : 0, surplus: r.exp, rueProd: v.prodRue,
    peakAvg: sum(r.peak)/12, peakMonths: Array.from(r.peak), peakPv: Array.from(r0.peak), impMonths: Array.from(r.imp), rows, npv, cum, payback, simple, cycles: cap ? r.dis/cap : 0};
}

/* ---------------- Formatage ---------------- */
const fCHF = x => (x < 0 ? '−' : '') + Math.round(Math.abs(x)).toLocaleString('fr-CH').replace(/ |\s/g, "'") ;
const fN = (x,d=0) => (x < 0 && Math.abs(x) >= 0.5*Math.pow(10,-d) ? '−' : '') + Math.abs(x).toLocaleString('fr-CH',{minimumFractionDigits:d,maximumFractionDigits:d}).replace(/ |\s/g, "'");
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
  renderCards(); renderComp(); renderFlux(); renderPS(); renderDetail(); renderAct(); renderBS(); renderOP(); renderA3();
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
       <label class="sw"><input type="checkbox" data-v="${i}" data-k="gridChg" ${(r.v.gridChg ?? G.gridChg)?'checked':''} ${r.v.batOn?'':'disabled'}><span class="k"></span>Recharge réseau</label>
       <i class="tip" data-tip="Batterie : retire la batterie de la variante et baisse le prix de l'offre. Peak shaving : si désactivé, la batterie sert seulement à stocker le surplus solaire ; la pointe reste facturée. Recharge réseau : la batterie peut se recharger sur le réseau jusqu'à sa réserve, quand l'usine est bien sous le seuil de pointe (sinon uniquement avec le surplus solaire).">i</i>
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
     ${r.hasBat && r.mode===0 ? `<div class="cap">Pilotage ${PILOT[pilot()].t.toLowerCase()} : ${seuilTxt(r)}, réserve pointes hiver ${fN(r.R*r.cap)} kWh, été ${fN(r.Rs*r.cap)} kWh${G.auto?' (réglage automatique)':''}</div>` : ''}
   </div>`).join('');
  el.insertAdjacentHTML('beforeend', optCard());
  el.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = e => { V[+e.target.dataset.v][e.target.dataset.k] = e.target.checked; save(); schedule(); });
  const go = el.querySelector('#goOpt'); if (go) go.onclick = () => document.querySelector('.tab[data-tab=opt]').click();
  bindTips(el);
}
function optCard(){
  const r = RES_OPT;
  if (!r) return `<div class="card opt" style="--c:${COLOR_OPT}"><h2>Version optimale</h2><div class="sub">Calcul en cours en arrière-plan… <span id="optProg"></span></div><p class="cap">Elle apparaîtra ici dès que la recherche sera terminée (environ 15 s), et se met à jour à chaque changement de paramètre.</p></div>`;
  const c = r.cell, o = OP_OPTS.filter(([k]) => !OP[k]).map(([,t]) => t.toLowerCase());
  return `<div class="card opt" style="--c:${COLOR_OPT}">
     <h2>Version optimale</h2>
     <div class="sub">${fN(c.ru)} kWc autoconso${c.rue>0 ? ' + ' + fN(c.rue)+' kWc injection totale' : ''} · ${c.bat ? 'batterie '+fN(c.bat)+' kWh / '+fN(c.kw)+' kW' : 'sans batterie'}</div>
     <div class="toggles"><button class="btn sm" id="goOpt" style="margin:0">Régler dans l'onglet Version optimale</button><i class="tip" data-tip="Meilleure combinaison puissance RU / puissance RUE / batterie trouvée par l'onglet Version optimale (critère : ${OP_CRIT[OP.crit].t()}). Prix au prorata : ${fN(CF.pKwc)} CHF/kWc et ${fN(BS.perKwh)} CHF/kWh de batterie. Se met à jour à chaque changement de paramètre.">i</i></div>
     <div class="kpis">
       <div class="kpi"><b>${fCHF(r.net)}</b><span>Investissement net (CHF)</span></div>
       <div class="kpi"><b>${fY(r.payback)}</b><span>Entièrement payé après</span></div>
       <div class="kpi"><b>${fCHF(r.year1)}</b><span>Gain 1re année (CHF)</span></div>
       <div class="kpi"><b>${fM(r.npv)}</b><span>Gain net actualisé (CHF)</span></div>
       <div class="kpi"><b>${fN(r.tauxAc*100,1)} %</b><span>Taux d'autoconsommation</span></div>
       <div class="kpi"><b>${fN(r.couverture*100,1)} %</b><span>Consommation couverte</span></div>
       <div class="kpi"><b>${fN(r.peakAvg)} kW</b><span>Pointe moyenne / mois</span></div>
       <div class="kpi"><b>${fM(r.cum)}</b><span>Liquidités à ${Math.round(G.horizon)} ans (CHF)</span></div>
     </div>
     <div class="cap">${r.hasBat && r.mode===0 ? `Pilotage ${PILOT[pilot()].t.toLowerCase()} : ${seuilTxt(r)}. ` : ''}${o.length ? 'Options désactivées : ' + o.join(', ') + '. ' : ''}Prix au prorata (${fN(CF.pKwc)} CHF/kWc), pas les prix du Fichier Vert.</div>
   </div>`;
}

function renderComp(){
  const H = Math.round(G.horizon);
  const best = RES.reduce((a,b,i)=> b.npv > RES[a].npv ? i : a, 0);
  const sorted = RES.map(r=>r.npv).sort((a,b)=>b-a);
  document.getElementById('best').textContent = `Meilleure variante sur le gain net actualisé : ${RES[best].v.name} · ${fCHF(sorted[0]-sorted[1])} CHF d'avance sur la 2e (${fN((sorted[0]-sorted[1])/Math.abs(sorted[0])*100,1)} %).`;
  if (RES_OPT) document.getElementById('best').textContent += ` La version optimale (${fN(RES_OPT.cell.ru)} kWc RU + ${fN(RES_OPT.cell.rue)} kWc RUE${RES_OPT.cell.bat ? ', batterie '+fN(RES_OPT.cell.bat)+' kWh' : ''}) ferait ${RES_OPT.npv - RES[best].npv >= 0 ? '+' : ''}${fCHF(RES_OPT.npv - RES[best].npv)} CHF par rapport à ${RES[best].v.name.split(' · ')[0]}.`;
  const yrs = Array.from({length:H+1},(_,i)=>i);
  chart('chCum', {type:'line', data:{labels:yrs, datasets: CMP().map((r,i)=>({label:r.v.name, data:[-Math.min(G.fp, r.price)].concat(r.rows.map(x=>x.cum)), borderColor:CMPC()[i], backgroundColor:CMPC()[i], borderDash: r.cell ? [6,3] : [], borderWidth:2.5, pointRadius:0, tension:.1}))},
    options:{interaction:{mode:'index',intersect:false}, plugins:{tooltip:tipCHF, legend:{position:'bottom'}}, scales:{x:{title:{display:true,text:'Années'},grid:{display:false}}, y:{...gridY, title:{display:true,text:'CHF'}}}}});
  chart('chNpv', {type:'bar', data:{labels:CMP().map(r=>r.v.name.split(' · ')[0]), datasets:[{label:'Gain net actualisé', data:CMP().map(r=>r.npv), backgroundColor:CMPC(), borderRadius:4}]},
    options:{plugins:{legend:{display:false}, tooltip:tipCHF}, scales:{x:{grid:{display:false}}, y:{...gridY, beginAtZero:true, title:{display:true,text:'CHF'}}}}});
  chart('chPeak', {type:'line', data:{labels:MONTHS, datasets:[{label:'Sans PV', data:Array.from(BASE.peak), borderColor:GREY, backgroundColor:GREY, borderDash:[5,4], borderWidth:2, pointRadius:2}].concat(CMP().map((r,i)=>({label:r.v.name.split(' · ')[0], data:r.peakMonths, borderColor:CMPC()[i], backgroundColor:CMPC()[i], borderDash: r.cell ? [6,3] : [], borderWidth:2, pointRadius:2})))},
    options:{interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:{grid:{display:false}}, y:{...gridY, title:{display:true,text:'kW'}}}}});
  chart('chEnergy', {type:'bar', data:{labels:CMP().map(r=>r.v.name.split(' · ')[0]), datasets:[
      {label:'Autoconsommé', data:CMP().map(r=>r.autoconso/1000), backgroundColor:'#2a78d6'},
      {label:'Surplus revendu', data:CMP().map(r=>r.surplus/1000), backgroundColor:'#eda100'},
      {label:'Injection totale (RUE)', data:CMP().map(r=>r.rueProd/1000), backgroundColor:'#1baf7a'}]},
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
  document.getElementById('tblComp').innerHTML = '<thead><tr><th></th>' + CMP().map((r,i)=>`<th style="color:${CMPC()[i]}">${r.cell ? 'Version optimale<br><span style="font-weight:400;font-size:11px">'+fN(r.cell.ru)+' RU + '+fN(r.cell.rue)+' RUE kWc'+(r.cell.bat?', '+fN(r.cell.bat)+' kWh':'')+'</span>' : r.v.name}</th>`).join('') + '</tr></thead><tbody>' +
    L.map(([l,f,h]) => `<tr class="${h?'hl':''}"><td>${l}</td>${CMP().map(r=>`<td>${f(r)}</td>`).join('')}</tr>`).join('') + '</tbody>';
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
  const lab = [], ld = [], pv = [], gr = [], so = [], pk = [], dayStart = [];
  const days = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  let E = {load:0, pv:0, imp:0, exp:0, maxImp:0, maxLoad:0};
  for (let i = i0; i < i1; i += agg){
    const d = new Date(S.t0 + i*900000);
    let a = 0, b = 0, c = 0, s = 0, k = 0;
    let hit = false;
    for (let j = i; j < Math.min(i + agg, i1); j++, k++){ a += S.load[j]; b += v.prodAc*S.pv[j]; c += r.r.grid[j]; s += r.r.soc[j]; if (r.r.kind && r.r.kind[j] === 3) hit = true; }
    ld.push(a/k); pv.push(b/k); gr.push(c/k); so.push(s/k); pk.push(hit ? s/k : null);
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
  chart('chSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:lw, pointRadius:0},
      {label:'La batterie coupe une pointe', data:pk, showLine:false, pointStyle:'rect', pointRadius:agg>4?3:4, backgroundColor:'#c0392b', borderColor:'#c0392b'}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:true, position:"bottom"}, tooltip:{filter:c=>c.parsed.y!=null, callbacks:{label:c=>c.datasetIndex===1 ? "Peak shaving" : `${fN(c.parsed.y)} kWh`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kWh'}}}}});
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
      {label:'Seuil de pointe (facturé)', data:thr, borderColor:'#1a1a19', borderDash:[2,3], borderWidth:1, pointRadius:0, spanGaps:true},
      ...(scen().m > 0 ? [{label:`Niveau visé par la batterie (seuil − ${scen().m} kW de marge)`, data:thr.map(t=> t==null ? null : t - scen().m), borderColor:'#1c3d5a', borderDash:[6,3], borderWidth:1.2, pointRadius:0, spanGaps:true}] : [])]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>c.parsed.y===null?'':`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kW'}}}}});
  chart('psBat', {type:'bar', data:{labels:lab, datasets:[
      {label:'Charge solaire', data:cS, backgroundColor:'#1baf7a', stack:'s'},
      {label:'Charge réseau', data:cG, backgroundColor:'#8c8b86', stack:'s'},
      {label:'Décharge peak shaving', data:dP, backgroundColor:'#c0392b', stack:'s'},
      {label:'Décharge autoconsommation', data:dA, backgroundColor:'#2a78d6', stack:'s'}]},
    options:{animation:false, barPercentage:1, categoryPercentage:1, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{filter:c=>c.parsed.y!==0, callbacks:{label:c=>`${c.dataset.label}: ${fN(Math.abs(c.parsed.y))} kW`}}}, scales:{x:{...xax, stacked:true}, y:{...gridY, stacked:true, title:{display:true,text:'kW'}}}}});
  chart('psSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:1.5, pointRadius:0},
      {label:'Réserve gardée pour les pointes', data:rsv, borderColor:'#c0392b', borderDash:[5,3], borderWidth:1.3, pointRadius:0, fill:false, stepped:true},
      {label:'La batterie coupe une pointe', data:so.map((x,k)=> dP[k] < 0 ? x : null), showLine:false, pointStyle:'rect', pointRadius:4, pointHoverRadius:6, backgroundColor:'#c0392b', borderColor:'#c0392b'}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:true, position:'bottom'}, tooltip:{filter:c=>c.parsed.y!=null, callbacks:{label:c=>c.datasetIndex===2 ? `Peak shaving : ${fN(-dP[c.dataIndex])} kW` : `${c.dataset.label} : ${fN(c.parsed.y)} kWh`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kWh'}}}}});
  const hb = (id, parts, total) => chart(id, {type:'bar', data:{labels:[''], datasets: parts.map(p=>({label:`${p[0]} : ${fN(p[1]/1000,1)} MWh (${total?fN(p[1]/total*100):0} %)`, data:[p[1]/1000], backgroundColor:p[2]}))},
    options:{indexAxis:'y', animation:false, plugins:{legend:{position:'bottom', labels:{boxWidth:12}}, tooltip:{callbacks:{label:c=>c.dataset.label}}}, scales:{x:{stacked:true, ...gridY, title:{display:true,text:'MWh'}}, y:{stacked:true, grid:{display:false}}}}});
  document.getElementById('psRate').textContent = `Taux d'autoconsommation sur la période : ${E.pv ? fN((E.pv - E.pvSold)/E.pv*100,1) : 0} % · consommation couverte par le solaire : ${E.load ? fN((E.direct + E.pvBat*G.eta*G.eta)/E.load*100,1) : 0} %.`;
  hb('psUse', [['Utilisée directement', E.direct, '#2a78d6'], ['Stockée dans la batterie', E.pvBat, '#1baf7a'], ['Revendue', E.pvSold, '#eda100']], E.pv);
  hb('psSrc', [['Solaire direct', E.direct, '#eda100'], ['Batterie (pointes)', E.batPeak, '#c0392b'], ['Batterie (autoconso)', E.batAc, '#1baf7a'], ['Réseau', E.load - E.direct - E.batPeak - E.batAc, '#8c8b86']], E.load);
}


// Explications du pilotage, recalculées pour chaque variante et chaque réglage
const whyCache = new Map();
function seuilTxt(r){ if (r.Tcal){ const a = r.Tm.slice().sort((x,y)=>x-y); return `${fN(a[0])} à ${fN(a[11])} kW selon le mois`; } return r.T === r.Ts ? `seuil ${fN(r.T)} kW` : `seuils ${fN(r.T)} / ${fN(r.Ts)} kW (hiver / été)`; }
function altRun(v, T, R, Rs, psOn, Ts, Tcal){
  const keep = G.auto; G.auto = false;
  try { return compute(Object.assign({}, v, {T, Ts: Ts ?? T, R, Rs, psOn: psOn ?? v.psOn, Tcal: Tcal || null})); } finally { G.auto = keep; }
}
function explainPS(r){
  const el = document.getElementById('psWhy'); if (!el) return;
  const v = r.v, key = JSON.stringify([v, G, r.T, r.Ts, r.R, r.Rs]);
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
    const T = r.T, Ts = r.Ts, cap = r.cap, rw = r.R*cap, rs = r.Rs*cap, TT = (a,b) => a === b ? `${fN(a)} kW` : `hiver ${fN(a)} / été ${fN(b)} kW`;
    const sh = d => r.Tcal ? r.Tcal.map(x => Math.max(300, x + d)) : null;
    const lo = altRun(v, Math.max(T-50, 300), r.R, r.Rs, undefined, Math.max(Ts-50, 300), sh(-50)), hi = altRun(v, T+50, r.R, r.Rs, undefined, Ts+50, sh(50)), z = altRun(v, T, 0, 0, undefined, Ts, r.Tcal);
    const held = MONTHS.filter((m,k)=>r.peakMonths[k] <= r.Tm[k] + 5);
    const S = YEAR, mx = new Array(12).fill(-1), mi = new Array(12).fill(0);
    for (let i = 0; i < S.n; i++){ const k = S.m[i]; if (r.r.grid[i] > mx[k]){ mx[k] = r.r.grid[i]; mi[k] = i; } }
    const why = {energie:[], puissance:[], weekend:[]};
    MONTHS.forEach((m,k) => { if (r.peakMonths[k] <= r.Tm[k] + 5) return; const i = mi[k], x = S.load[i] - v.prodAc*S.pv[i];
      const d = new Date(S.t0 + i*900000), when = `${m} (${['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'][d.getUTCDay()]} ${d.getUTCDate()}, ${String(d.getUTCHours()).padStart(2,'0')}h${String(d.getUTCMinutes()).padStart(2,'0')}, ${fN(r.peakMonths[k])} kW)`;
      if (x - r.Tm[k] > v.batKw + 1 && (i === 0 || r.r.soc[i-1] > 1)) why.puissance.push(when); else if (S.wk[i]) why.weekend.push(when); else why.energie.push(when); });
    const alts = r.Tcal ? [['Seuils par mois − 50 kW', lo], ['Seuils par mois', r], ['Seuils par mois + 50 kW', hi]] : [[TT(Math.max(T-50,300), Math.max(Ts-50,300)), lo], [TT(T, Ts), r], [TT(T+50, Ts+50), hi]], bestAlt = alts.reduce((a,b)=> tot(b[1]) > tot(a[1]) ? b : a);
    const vSun = v.acPrice - G.rev/(G.eta*G.eta), vGrid = v.acPrice - v.acPrice/(G.eta*G.eta);
    h = `<p><b>${n} : ${fN(v.batKwh)} kWh / ${fN(v.batKw)} kW, peak shaving activé${G.auto ? ', réglage automatique' : ', réglage manuel'}.</b> ` +
      `<span class="scen-note">Pilotage <b>${PILOT[pilot()].t}</b> : ${PILOT[pilot()].d}<br>Scénario <b>${scen().t}</b> : ${scen().d}</span> ` + (G.auto ? `Le simulateur a testé tous les seuils de 520 à 960 kW et plusieurs réserves sur la courbe ${pilot()==='ref' ? 'de l\'année simulée elle-même (référence théorique)' : 'de janvier à septembre 2025'}, et garde la combinaison qui coûte le moins cher (énergie + puissance + énergie réactive − revente).` : `Les valeurs viennent de l'onglet Paramètres.`) + `</p>
      <table class="why"><tr><td>Seuil de pointe hiver (oct.–mars)</td><td><b>${fN(T)} kW</b></td><td>Au-dessus, la batterie se décharge (jusqu'à ${fN(v.batKw)} kW). En hiver le soleil recharge peu : le seuil est plus haut pour que la batterie tienne tout le mois.</td></tr>
      <tr><td>Seuil de pointe été (avr.–sept.)</td><td><b>${fN(Ts)} kW</b></td><td>${Ts < T ? `Plus bas qu'en hiver : le surplus solaire remplit la batterie chaque jour, elle peut couper davantage.` : 'Même seuil qu\'en hiver.'}</td></tr>
      ${r.Tcal ? `<tr><td>Seuils par mois</td><td colspan="2">${MONTHS.map((m,k)=>`${m.split(' ')[0]} <b>${fN(r.Tm[k])}</b>`).join(' · ')} kW${pilot()==='mois' ? ' (octobre à décembre : seuil d\'hiver, ces mois ne sont pas dans la période de réglage)' : ''}</td></tr>` : ''}
      <tr><td>Réserve hiver (oct.–mars)</td><td><b>${fN(rw)} kWh</b> sur ${fN(cap)}</td><td>${r.R >= 0.999 ? 'Toute la batterie est gardée pour les pointes en semaine : en hiver les pointes durent des heures et le solaire ne la recharge pas.' : 'Énergie gardée pour les pointes en semaine ; le reste couvre l\'usine.'}</td></tr>
      <tr><td>Réserve été (avr.–sept.)</td><td><b>${fN(rs)} kWh</b> sur ${fN(cap)}</td><td>${r.Rs >= 0.999 ? 'Toute la batterie est gardée pour les pointes.' : `Au-dessus de ${fN(rs)} kWh, la batterie couvre l'usine ; le surplus solaire la remplit à nouveau.`}</td></tr></table>
      <p><b>Pourquoi ces seuils et pas d'autres ?</b> Plus le seuil est bas, plus il faut d'énergie pour le tenir : la batterie se vide et la pointe passe quand même, ce qui coûte tout le mois. Plus il est haut, moins on gagne de kW.</p>
      <table class="why"><tr><th>Seuil</th><th>Gain de puissance par an</th><th>Recettes 1re année</th></tr>
      <tr><td>${alts[0][0]}</td><td>${fCHF(lo.sPeak)} CHF</td><td>${fCHF(tot(lo))} CHF</td></tr>
      <tr class="hl"><td>${alts[1][0]} (retenu)</td><td>${fCHF(r.sPeak)} CHF</td><td>${fCHF(tot(r))} CHF</td></tr>
      <tr><td>${alts[2][0]}</td><td>${fCHF(hi.sPeak)} CHF</td><td>${fCHF(tot(hi))} CHF</td></tr></table>
      ${bestAlt[1] !== r ? `<p class="note-warn">Sur l'année simulée (oct. 2025 – sept. 2026), le réglage « ${bestAlt[0]} » aurait rapporté ${fCHF(tot(bestAlt[1]) - tot(r))} CHF de plus. ${G.auto ? (pilot()==='ref' ? `La référence est réglée par pas de 10 kW mois par mois : ce petit écart vient de la méthode de recherche.` : `Le réglage automatique est fait sur janvier–septembre 2025, sans connaître les pointes de l'année simulée, comme le ferait le vrai pilotage : cet écart montre la marge d'incertitude du réglage.`) : `Vous pouvez essayer cette valeur dans l'onglet Paramètres.`}</p>` : `<p>Sur l'année simulée, ${TT(T, Ts)} est bien le meilleur des trois réglages.</p>`}
      <p><b>Mois où le seuil tient :</b> ${held.length ? held.join(', ') : 'aucun'}.</p>
      ${why.energie.length ? `<p><b>Batterie vide au moment de la pointe :</b> ${why.energie.join(' ; ')}. ${(v.gridChg ?? G.gridChg) ? `La pointe a duré trop longtemps pour l'énergie disponible (${fN(cap)} kWh utiles), surtout en hiver quand le solaire ne recharge pas.` : `Sans recharge sur le réseau, la batterie (${fN(cap)} kWh utiles) ne se remplit qu'au soleil : tôt le matin, le soir ou après des jours gris, elle était vide ou trop basse au moment de la pointe.`}</p>` : ''}
      ${why.puissance.length ? `<p><b>Puissance de la batterie trop faible :</b> ${why.puissance.join(' ; ')}. L'usine a dépassé le seuil de plus de ${fN(v.batKw)} kW, la puissance maximale de décharge : la batterie ne peut couper que ${fN(v.batKw)} kW.</p>` : ''}
      ${why.weekend.length ? `<p><b>Pointe pendant le week-end :</b> ${why.weekend.join(' ; ')}. ${v.wkFree === true ? `Le week-end, la réserve est libérée pour l'usine ; la batterie n'avait plus assez d'énergie.` : `La batterie, vidée par une pointe précédente, ne s'était pas assez rechargée au soleil.`}</p>` : ''}
      ${held.length < 12 ? `<p class="cap">Même quand le seuil ne tient pas, la pointe de ces mois reste plus basse que sans batterie.</p>` : ''}
      <p><b>Pourquoi la batterie reste parfois à sa réserve sans servir l'usine ?</b> Parce qu'un kWh gardé pour une pointe vaut beaucoup plus qu'un kWh consommé :</p>
      <ul>
        <li>Un kWh pris dans la batterie pour l'usine fait gagner ${fN(vSun*100,2)} ct s'il est rechargé avec du solaire (on évite ${fN(v.acPrice*100,2)} ct, mais on ne revend pas ${fN(G.rev*100,2)} ct et on perd ${fN((1-G.eta*G.eta)*100)} %), ${(v.gridChg ?? G.gridChg) ? `et fait <b>perdre</b> ${fN(-vGrid*100,2)} ct s'il est rechargé sur le réseau (pertes seules)` : `; la batterie n'est jamais rechargée sur le réseau, donc chaque kWh donné à l'usine manque si une pointe arrive avant le prochain soleil`}.</li>
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
  const S = YEAR, v = r.v, ps = r.hasBat && r.mode === 0, T = r.T, Ts = r.Ts;
  const need = [], hrs = [];
  for (let m = 0; m < 12; m++){ need.push(0); hrs.push(0); }
  if (ps){
    const day = {};
    for (let i = 0; i < S.n; i++){
      if (S.wk[i]) continue;
      const x = S.load[i] - v.prodAc*S.pv[i], d = Math.floor(i/96), k = S.m[i];
      if (!day[d]) day[d] = {k, e:0, h:0};
      const Tk = r.Tm[k]; if (x > Tk){ day[d].e += (x - Tk)*DT; day[d].h += DT; }
    }
    Object.values(day).forEach(d => { need[d.k] = Math.max(need[d.k], d.e); hrs[d.k] = Math.max(hrs[d.k], d.h); });
  }
  let tS = 0, tB = 0;
  const rows = MONTHS.map((mo, k) => {
    const b = BASE.peak[k], p0 = r.peakPv[k], p = r.peakMonths[k], gS = (b - p0)*G.puiss, gB = (p0 - p)*G.puiss;
    tS += gS; tB += gB;
    const held = ps && p <= r.Tm[k] + 5;
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
      <div class="kpi"><b>${ps ? seuilTxt(r) : '–'}</b><span>Seuil de pointe (${PILOT[pilot()].t.toLowerCase()})</span></div>
      <div class="kpi"><b>${ps ? fN(r.R*cap)+' kWh' : '–'}</b><span>Réserve pour les pointes, hiver (oct.–mars)</span></div>
      <div class="kpi"><b>${ps ? fN(r.Rs*cap)+' kWh' : '–'}</b><span>Réserve pour les pointes, été (avr.–sept.)</span></div></div>
    <ol class="rules">
      <li><b>Trop de soleil :</b> le surplus charge la batterie ; quand elle est pleine, le reste est revendu.</li>
      ${ps ? `<li><b>L'usine tire plus que le seuil (${fN(T)} kW en hiver, ${fN(Ts)} kW en été) :</b> la batterie se décharge (jusqu'à ${fN(v.batKw)} kW) pour que le réseau ne fournisse pas plus que le seuil. Si une pointe passe quand même, le seuil remonte jusqu'à la fin du mois, puisque la pointe facturée est déjà atteinte.</li>
      <li><b>Sous le seuil, batterie au-dessus de la réserve :</b> l'énergie en trop couvre la consommation de l'usine.</li>
      ${(v.gridChg ?? G.gridChg) ? `<li><b>Bien sous le seuil (moins de ${fN(T-100)} kW) et batterie sous la réserve :</b> recharge sur le réseau jusqu'à la réserve seulement, sans dépasser ${fN(T-50)} kW de soutirage.</li>` : `<li><b>Jamais de recharge sur le réseau :</b> la batterie ne se remplit qu'avec le surplus solaire. Quand le soleil ne suffit pas (hiver, mauvais temps), elle peut rester vide plusieurs jours et ne coupe alors plus les pointes.</li>`}
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
        taux: r.tauxAc, cyc: k > 0 ? sh.chg/(k*G.usable) : 0, held: k > 0 ? r.peakMonths.filter((p,m) => p <= r.Tm[m] + 5).length : 0, T: k > 0 ? r.T : null, Ts: k > 0 ? r.Ts : null, ps, ac, pay: r.payback});
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
      `La taille la plus rentable est <b>${fN(b.k)} kWh / ${fN(b.kw)} kW</b> : <b>${gB>=0?'+':''}${fCHF(gB)} CHF</b> sur ${H} ans par rapport à sans batterie (coût ${fCHF(b.cost)} CHF, seuils ${fN(b.T)} / ${fN(b.Ts)} kW, tenus ${b.held} mois sur 12).`}</p>
    <p>Batterie de l'offre (${fN(v.batKwh)} kWh) : ${gC>=0?'+':''}${fCHF(gC)} CHF sur ${H} ans${cur.k !== v.batKwh ? ` (valeur la plus proche testée : ${fN(cur.k)} kWh)` : ''}.</p>
    <p class="cap">Chaque taille est simulée au quart d'heure avec son propre réglage de pilotage (seuil et réserve). Coût : ${fN(BS.perKwh)} CHF/kWh (Pylontech A1000-OMNI du fichier vert, onduleur compris) + ${fCHF(bsFixed(v))} CHF de coûts fixes propres à ${v.name.split(' · ')[0]}, pour retrouver le prix de la batterie de l'offre. Puissance = ${fN(BS.ratio,2)} × capacité. Les petites tailles ont surtout de la puissance qui manque, les grandes restent pleines une partie de l'année : au-delà de l'optimum, chaque tranche ajoutée rapporte moins qu'elle ne coûte (barres rouges du dernier graphique).</p>`;
  document.getElementById('bsTbl').innerHTML = `<thead><tr><th>Capacité</th><th>Puissance</th><th>Coût batterie</th><th>Seuil</th><th>Mois tenus</th><th>Cycles/an</th><th>Gain pointe/an</th><th>Gain total 1re année</th><th>Liquidités ${H} ans</th><th>vs sans batterie</th></tr></thead><tbody>` +
    a.map(x => `<tr class="${x===b?'hl':''}"><td>${fN(x.k)} kWh</td><td>${fN(x.kw)} kW</td><td>${fCHF(x.cost)}</td><td>${x.T?fN(x.T)+' / '+fN(x.Ts)+' kW':'–'}</td><td>${x.k?x.held:'–'}</td><td>${fN(x.cyc)}</td><td>${fCHF(x.sPeak-base.sPeak)}</td><td>${fCHF(x.y1-base.y1)}</td><td>${fCHF(x.cum)}</td><td class="${x.cum-base.cum<0?'neg':''}">${x.cum-base.cum>=0?'+':''}${fCHF(x.cum-base.cum)}</td></tr>`).join('') + '</tbody>';
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
  const keepKw = document.getElementById('cf_keep').checked;
  for (let pass = 0; pass < 2; pass++){ plan.push(['ac', AC], ['bat', BAT]); if (!keepKw) plan.push(['kwc', KW]); }
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
    document.getElementById('cfOptTxt').innerHTML = `<b>Configuration la plus rentable trouvée${keepKw ? ` pour ${fN(cur.kwc)} kWc` : ''}</b> (${memo.size} configurations testées, scénario ${scen().t}) : <b>${fN(cur.kwc)} kWc</b>, dont <b>${fN(acK)} kWc en autoconsommation</b> (${cur.ac} %) et <b>${fN(cur.kwc-acK)} kWc en injection totale</b>, ${cur.bat ? `batterie <b>${fN(cur.bat)} kWh / ${fN(cur.bat*BS.ratio)} kW</b>` : '<b>sans batterie</b>'} → <b>${fCHF(cfBest.cum)} CHF</b> de liquidités à ${H} ans, soit ${cfBest.cum-ref[bi]>=0?'+':''}${fCHF(cfBest.cum-ref[bi])} CHF par rapport à la meilleure variante actuelle (${RES[bi].v.name.split(' · ')[0]}).
      <br><span class="cap">Les curseurs sont placés sur cette configuration : déplacez-les pour voir ce que coûte chaque écart. Critère : liquidités cumulées à ${H} ans (durée réglable dans Paramètres). ${G.rueOn ? `Hypothèse forte : RUE de ${fN(G.rueRate)} CHF/kWc obtenue à l'enchère ; désactivez la RUE dans Paramètres pour voir l'optimum sans elle.` : 'RUE désactivée : l\'injection totale ne reçoit que la RU ordinaire.'} Production par kWc et prix par kWc : valeurs des champs ci-dessous.</span>`;
    renderCF();
  };
  setTimeout(step, 0);
}
document.getElementById('cfOpt').onclick = () => cfOptimize();


/* ---------------- Version optimale : puissance RU, puissance RUE, batterie ---------------- */
const OP = {roof: 4201, step: 300, bmax: 1500, bstep: 250, crit: 'cum', view: 'best', mode3: 'surface', ps: true, bat: true, rue: true, allowRue: true, grid: false, wk: false};
const OP_OPTS = [['bat','Batterie','Tester des batteries sur la partie RU. Désactivé : uniquement des installations sans batterie.'],
  ['ps','Peak shaving','La batterie écrête les pointes (seuils hiver / été réglés automatiquement). Désactivé : elle ne sert qu\'à l\'autoconsommation.'],
  ['rue','RUE obtenue à l\'enchère','Activé : l\'installation RUE (dès 150 kWc) reçoit le montant RUE par kWc des Paramètres. Désactivé : elle ne reçoit que la RU ordinaire.'],
  ['allowRue','Autoriser une installation RUE','Désactivé : seule une installation en autoconsommation (RU) est testée, sans injection totale séparée.'],
  ['grid','Recharge réseau','La batterie peut se recharger sur le réseau jusqu\'à sa réserve (désactivé par défaut).'],
  ['wk','Réserve libérée le week-end','Du vendredi 22h au dimanche 20h, la batterie se vide pour l\'usine.']];
let opRun = 0, opData = null, opDrawn = null, opCamRev = 1, opRunKey = null;
// Résultat complet de la version optimale pour l'onglet Comparaison ; renvoie true s'il a changé
function opSetResult(){
  if (!opData) return false;
  const best = opBest(opData.cells), k = opData.key + '|' + OP.crit + '|' + [best.ru, best.rue, best.bat].join(',') + '|' + JSON.stringify(RES.map(r => Math.round(r.cum)));
  if (k === RES_OPT_KEY) return false;
  const keep = G.rueOn; G.rueOn = OP.rue;
  let r; try { r = compute(Object.assign(opVariant(best.ru, best.rue, best.bat), {gridChg: OP.grid})); } finally { G.rueOn = keep; }
  r.cell = best; RES_OPT = r; RES_OPT_KEY = k; return true;
}
const opSig = () => [opData && opData.key, OP.crit, OP.view, OP.mode3, opCamRev, RES.map(r => Math.round(r.rows[r.rows.length-1].cum)).join(',')].join('§');
function loadPlotly(cb){
  if (window.Plotly) return cb();
  const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js';
  sc.onload = cb; sc.onerror = () => { document.getElementById('opStatus').textContent = 'Impossible de charger la bibliothèque 3D (connexion).'; };
  document.head.appendChild(sc);
}
function opVariant(ru, rue, bat){
  const bc = bat > 0 ? bsFixed(V[1]) + BS.perKwh*bat : 0;
  return Object.assign({}, V[1], {name:'Version optimale', acKwc: ru, rueKwc: rue, prodAc: ru*CF.yAc, prodRue: rue*CF.yRue,
    price: (ru + rue)*CF.pKwc + bc, batOn: bat > 0, psOn: OP.ps, batKwh: bat, batKw: Math.round(bat*BS.ratio), batReduc: bc, subCom: 0, wkFree: OP.wk, gridChg: OP.grid});
}
const OP_CRIT = {cum: {t: () => `Liquidités à ${Math.round(G.horizon)} ans`, u:'CHF'}, npv: {t: () => 'Gain net actualisé', u:'CHF'}, roi: {t: () => `Liquidités à ${Math.round(G.horizon)} ans par franc investi (net)`, u:'CHF/CHF'}};
function opVal(c){ return OP.crit === 'npv' ? c.npv : OP.crit === 'roi' ? c.roi : c.cum; }
function opKey(){ const {crit, view, mode3, ...o} = OP; return JSON.stringify([G, BS, CF.yAc, CF.yRue, CF.pKwc, o, V]); } // tout paramètre qui change le calcul
function renderOP(force){
  ['roof','step','bmax','bstep'].forEach(k => { const el = document.getElementById('op_' + k); if (el && document.activeElement !== el) el.value = OP[k]; });
  [['yAc','op_yAc'],['yRue','op_yRue'],['pKwc','op_pKwc']].forEach(([k,id]) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = CF[k]; });
  const bp = document.getElementById('op_perKwh'); if (bp && document.activeElement !== bp) bp.value = BS.perKwh;
  const ot = document.getElementById('opOpts');
  ot.innerHTML = OP_OPTS.map(([k,t,d]) => `<label class="sw" title="${d.replace(/"/g,'&quot;')}"><input type="checkbox" data-k="${k}" ${OP[k]?'checked':''} ${(k==='ps'||k==='grid'||k==='wk') && !OP.bat ? 'disabled' : ''} ${k==='rue' && !OP.allowRue ? 'disabled' : ''}><span class="k"></span>${t}</label>`).join('');
  ot.querySelectorAll('input').forEach(i => i.onchange = () => { OP[i.dataset.k] = i.checked; renderOP(); });
  document.querySelectorAll('#opCrit button').forEach(b => b.classList.toggle('on', b.dataset.c === OP.crit));
  document.querySelectorAll('#opMode3 button').forEach(b => b.classList.toggle('on', b.dataset.m === OP.mode3));
  const optOn = document.getElementById('tab-opt').classList.contains('active'), compOn = document.getElementById('tab-comp').classList.contains('active');
  if (!optOn && !compOn && !force) return;
  const key = opKey();
  if (opData && opData.key === key){ if (opSetResult()){ renderCards(); renderComp(); } if (optOn && opDrawn !== opSig()) loadPlotly(drawOP); return; }
  if (opRunKey === key) return; // déjà en cours pour ces paramètres
  opRunKey = key;
  if (RES_OPT){ RES_OPT = null; RES_OPT_KEY = null; renderCards(); renderComp(); } // l'ancienne version optimale n'est plus valable
  const run = ++opRun, st = document.getElementById('opStatus'), H = Math.max(1, Math.round(G.horizon));
  const RU = [], BAT = [];
  for (let x = 0; x <= OP.roof + 1e-9; x += OP.step) RU.push(Math.round(x));
  if (RU[RU.length-1] < OP.roof - 1) RU.push(Math.round(OP.roof));
  for (let b = 0; b <= (OP.bat ? OP.bmax : 0) + 1e-9; b += OP.bstep) BAT.push(Math.round(b));
  const jobs = [];
  RU.forEach(ru => BAT.forEach(bat => { if (ru === 0 && bat > 0) return; RU.forEach(rue => { if (ru + rue > OP.roof + 1 || ru + rue === 0 || (!OP.allowRue && rue > 0)) return; jobs.push([ru, rue, bat]); }); }));
  const cells = [];
  let n = 0; const t0all = performance.now();
  const step = () => {
    if (run !== opRun) return;
    const t0 = performance.now();
    while (n < jobs.length && performance.now() - t0 < 120){
      const [ru, rue, bat] = jobs[n++], v = opVariant(ru, rue, bat), keepG = {rueOn: G.rueOn, gridChg: G.gridChg};
      G.rueOn = OP.rue; G.gridChg = OP.grid;
      let r; try { r = compute(v); } finally { G.rueOn = keepG.rueOn; G.gridChg = keepG.gridChg; }
      const cum = r.rows[H-1].cum;
      cells.push({ru, rue, bat, kw: v.batKw, price: r.price, cum, npv: r.npv, roi: cum/Math.max(1, r.price - r.sub), y1: r.year1, sub: r.sub, pay: r.payback, taux: r.tauxAc, T: r.hasBat && r.mode === 0 ? r.T : null, Ts: r.hasBat && r.mode === 0 ? r.Ts : null});
    }
    const pc = n/jobs.length, el = (performance.now() - t0all)/1000;
    st.textContent = n < jobs.length ? `Calcul ${Math.round(pc*100)} % · ${n} / ${jobs.length} configurations · encore ~${Math.max(1, Math.round(el/pc - el))} s` : `${jobs.length} configurations calculées en ${Math.round(el)} s · scénario ${scen().t}`;
    document.getElementById('opBar').style.width = (pc*100) + '%';
    const pg = document.getElementById('optProg'); if (pg) pg.textContent = Math.round(pc*100) + ' %';
    if (n < jobs.length){ setTimeout(step, 0); return; }
    opData = {key, cells, RU, BAT, H}; opRunKey = null;
    if (opSetResult()){ renderCards(); renderComp(); }
    if (document.getElementById('tab-opt').classList.contains('active')) loadPlotly(drawOP);
  };
  document.getElementById('opBar').style.width = '0%';
  st.textContent = 'Calcul…'; setTimeout(step, 30);
}
function opBest(list){ return list.reduce((b,c) => opVal(c) > opVal(b) ? c : b, list[0]); }
function drawOP(){
  if (!opData || !window.Plotly) return;
  opDrawn = opSig();
  const {cells, RU, BAT, H} = opData, crit = OP_CRIT[OP.crit], best = opBest(cells);
  // sélecteur de batterie pour la carte et la surface
  const vs = document.getElementById('opView');
  vs.innerHTML = `<option value="best">Meilleure batterie pour chaque case</option>` + BAT.map(b => `<option value="${b}">${b ? fN(b)+' kWh / '+fN(b*BS.ratio)+' kW' : 'Sans batterie'}</option>`).join('');
  vs.value = OP.view;
  const pick = (ru, rue) => { const l = cells.filter(c => c.ru === ru && c.rue === rue && (OP.view === 'best' || c.bat === +OP.view)); return l.length ? opBest(l) : null; };
  const Z = RU.map(rue => RU.map(ru => { const c = pick(ru, rue); return c ? opVal(c) : null; }));
  const Bz = RU.map(rue => RU.map(ru => { const c = pick(ru, rue); return c ? c.bat : null; }));
  const fmt = x => OP.crit === 'roi' ? fN(x, 2) : fCHF(x);
  const hover = RU.map(rue => RU.map(ru => { const c = pick(ru, rue); return c ? `RU ${fN(ru)} kWc + RUE ${fN(rue)} kWc = ${fN(ru+rue)} kWc<br>Batterie ${c.bat ? fN(c.bat)+' kWh / '+fN(c.kw)+' kW' : 'aucune'}<br>Prix ${fCHF(c.price)} CHF · RU+RUE ${fCHF(c.sub)} CHF<br>${crit.t()} : <b>${fmt(opVal(c))}</b>` : ''; }));
  const varPts = RES.map((r,i) => ({x: r.v.acKwc, y: r.v.rueKwc, n: r.v.name.split(' · ')[0], c: COLORS[i]}));
  const font = {family:'Helvetica Neue, Arial, sans-serif', size:12, color:'#1a1a19'};
  const scale = [[0,'#f4f1ea'],[0.5,'#8fb3d6'],[1,'#1c3d5a']];
  // carte 2D
  Plotly.react('opMap', [
    {type:'heatmap', x:RU, y:RU, z:Z, text:hover, hoverinfo:'text', colorscale:scale, colorbar:{title:{text:crit.u, side:'right'}, thickness:12}, zsmooth:false, xgap:1, ygap:1},
    {type:'scatter', mode:'lines', x:[0, OP.roof], y:[OP.roof, 0], line:{color:'#b3261e', dash:'dot', width:1.5}, name:'Toiture pleine', hoverinfo:'skip'},
    {type:'scatter', mode:'markers+text', x:varPts.map(p=>p.x), y:varPts.map(p=>p.y), text:varPts.map(p=>p.n), textposition:'top right', marker:{size:11, color:varPts.map(p=>p.c), line:{color:'#fff', width:2}}, name:'Variantes actuelles', hoverinfo:'text', hovertext:varPts.map(p=>p.n)},
    {type:'scatter', mode:'markers+text', x:[best.ru], y:[best.rue], text:['Optimum'], textposition:'bottom right', textfont:{color:'#000', size:13}, marker:{symbol:'star', size:20, color:'#eda100', line:{color:'#000', width:1.5}}, name:'Optimum', hoverinfo:'text', hovertext:[`Optimum : RU ${fN(best.ru)} + RUE ${fN(best.rue)} kWc, batterie ${fN(best.bat)} kWh`]}],
    {margin:{l:60,r:20,t:10,b:50}, height:470, font, uirevision:'opmap', xaxis:{title:{text:'Installation RU, autoconsommation (kWc)'}, zeroline:false, range:[-OP.step*0.6, OP.roof + OP.step*0.6]}, yaxis:{title:{text:'Installation RUE, injection totale (kWc)'}, zeroline:false, range:[-OP.step*0.6, OP.roof + OP.step*0.6]}, legend:{orientation:'h', y:-0.18}, showlegend:true, plot_bgcolor:'#fff', paper_bgcolor:'#fff'},
    {responsive:true, displaylogo:false, modeBarButtonsToRemove:['lasso2d','select2d']});
  // 3D
  if (OP.mode3 === 'surface'){
    Plotly.react('op3d', [
      (() => { const P = []; RU.forEach((rue,j) => RU.forEach((ru,i) => { if (Z[j][i] != null) P.push([ru, rue, Z[j][i], hover[j][i]]); }));
        return {type:'mesh3d', x:P.map(p=>p[0]), y:P.map(p=>p[1]), z:P.map(p=>p[2]), intensity:P.map(p=>p[2]), colorscale:scale, showscale:false, opacity:0.95, flatshading:false,
          text:P.map(p=>p[3]), hoverinfo:'text', lighting:{ambient:0.75, diffuse:0.6, specular:0.1}}; })(),
      {type:'scatter3d', mode:'markers+text', x:[best.ru], y:[best.rue], z:[opVal(best)], text:['Optimum'], marker:{size:7, color:'#eda100', symbol:'diamond', line:{color:'#000', width:1}}, textfont:{size:13}, hoverinfo:'text', hovertext:['Optimum']},
      {type:'scatter3d', mode:'markers+text', x:varPts.map(p=>p.x), y:varPts.map(p=>p.y), z:RES.map(r => OP.crit === 'npv' ? r.npv : OP.crit === 'roi' ? r.rows[H-1].cum/Math.max(1, r.price - r.sub) : r.rows[H-1].cum), text:varPts.map(p=>p.n), marker:{size:5, color:varPts.map(p=>p.c)}, hoverinfo:'text', hovertext:varPts.map(p=>p.n)}],
      {margin:{l:0,r:0,t:0,b:0}, height:520, font, showlegend:false, uirevision:'op3d'+opCamRev+OP.mode3, scene:{dragmode:'turntable', xaxis:{title:{text:'RU (kWc)'}}, yaxis:{title:{text:'RUE (kWc)'}}, zaxis:{title:{text:crit.u}}, camera:{eye:{x:-1.6, y:-1.6, z:0.9}}}, paper_bgcolor:'#fff'},
      {responsive:true, displaylogo:false, scrollZoom:false, modeBarButtonsToRemove:['resetCameraLastSave3d']});
  } else {
    const vals = cells.map(opVal), lo = Math.min(...vals), hi = Math.max(...vals);
    Plotly.react('op3d', [
      {type:'scatter3d', mode:'markers', x:cells.map(c=>c.ru), y:cells.map(c=>c.rue), z:cells.map(c=>c.bat),
        marker:{size:cells.map(c => 3 + 9*((opVal(c)-lo)/Math.max(1e-9, hi-lo))**2), color:vals, colorscale:scale, opacity:0.85, colorbar:{title:{text:crit.u}, thickness:12}},
        hoverinfo:'text', hovertext:cells.map(c => `RU ${fN(c.ru)} + RUE ${fN(c.rue)} kWc<br>Batterie ${c.bat ? fN(c.bat)+' kWh' : 'aucune'}<br>${crit.t()} : ${fmt(opVal(c))}`)},
      {type:'scatter3d', mode:'markers+text', x:[best.ru], y:[best.rue], z:[best.bat], text:['Optimum'], marker:{size:9, color:'#eda100', symbol:'diamond', line:{color:'#000', width:1}}, hoverinfo:'skip'}],
      {margin:{l:0,r:0,t:0,b:0}, height:520, font, showlegend:false, uirevision:'op3d'+opCamRev+OP.mode3, scene:{dragmode:'turntable', xaxis:{title:{text:'RU (kWc)'}}, yaxis:{title:{text:'RUE (kWc)'}}, zaxis:{title:{text:'Batterie (kWh)'}}, camera:{eye:{x:-1.6, y:-1.6, z:0.9}}}, paper_bgcolor:'#fff'},
      {responsive:true, displaylogo:false, scrollZoom:false, modeBarButtonsToRemove:['resetCameraLastSave3d']});
  }
  // courbes autour de l'optimum
  const atSplit = BAT.map(b => cells.find(c => c.ru === best.ru && c.rue === best.rue && c.bat === b)).filter(Boolean);
  Plotly.react('opBat', [{type:'scatter', mode:'lines+markers', x:atSplit.map(c=>c.bat), y:atSplit.map(opVal), line:{color:'#1c3d5a', width:2.5}, marker:{size:atSplit.map(c=> c === best ? 12 : 6), color:atSplit.map(c=> c === best ? '#eda100' : '#1c3d5a')}, hovertemplate:'%{x} kWh : %{y:,.0f}<extra></extra>'}],
    {margin:{l:70,r:10,t:10,b:45}, height:280, font, xaxis:{title:{text:'Batterie (kWh)'}}, yaxis:{title:{text:crit.u}}, plot_bgcolor:'#fff'}, {displaylogo:false, responsive:true});
  const tot = best.ru + best.rue, line = RU.map(ru => cells.filter(c => c.ru === ru && Math.abs(c.ru + c.rue - tot) < 1 && c.bat === best.bat)[0]).filter(Boolean);
  Plotly.react('opSplit', [{type:'scatter', mode:'lines+markers', x:line.map(c=>c.ru), y:line.map(opVal), line:{color:'#2a78d6', width:2.5}, marker:{size:line.map(c=> c === best ? 12 : 6), color:line.map(c=> c === best ? '#eda100' : '#2a78d6')}, hovertemplate:'RU %{x} kWc : %{y:,.0f}<extra></extra>'}],
    {margin:{l:70,r:10,t:10,b:45}, height:280, font, xaxis:{title:{text:`Part RU sur ${fN(tot)} kWc (le reste en RUE)`}}, yaxis:{title:{text:crit.u}}, plot_bgcolor:'#fff'}, {displaylogo:false, responsive:true});
  // synthèse
  const ref = RES.map(r => ({n: r.v.name.split(' · ')[0], v: OP.crit === 'npv' ? r.npv : OP.crit === 'roi' ? r.rows[H-1].cum/Math.max(1, r.price - r.sub) : r.rows[H-1].cum}));
  const bref = ref.reduce((a,b) => b.v > a.v ? b : a);
  document.getElementById('opBest').innerHTML = `
    <div class="kpirow" style="grid-template-columns:repeat(5,1fr);margin:0">
      <div class="kpi"><b>${fN(best.ru)} kWc</b><span>Installation RU (autoconsommation)</span></div>
      <div class="kpi"><b>${fN(best.rue)} kWc</b><span>Installation RUE (injection totale)</span></div>
      <div class="kpi"><b>${best.bat ? fN(best.bat)+' kWh / '+fN(best.kw)+' kW' : 'aucune'}</b><span>Batterie (sur la partie RU)</span></div>
      <div class="kpi"><b>${fN(tot)} kWc</b><span>Puissance totale · ${fCHF(best.price)} CHF</span></div>
      <div class="kpi"><b>${fmt(opVal(best))}</b><span>${crit.t()} · ${OP.crit === 'roi' ? '' : (opVal(best) - bref.v >= 0 ? '+' : '') + fCHF(opVal(best) - bref.v) + ' CHF vs ' + bref.n}</span></div>
    </div>
    <p class="cap">Recettes 1re année ${fCHF(best.y1)} CHF · RU + RUE ${fCHF(best.sub)} CHF · payée après ${best.pay != null ? fN(best.pay,1) + ' ans' : '–'} · autoconsommation de la partie RU ${fN(best.taux*100,1)} %${best.T ? ` · seuils de pointe ${fN(best.T)} / ${fN(best.Ts)} kW` : ''}.
    Options : ${OP_OPTS.map(([k,t]) => `${t} ${OP[k] ? 'oui' : 'non'}`).join(' · ')} · scénario ${scen().t}. ${OP.allowRue ? (OP.rue ? `RUE comptée à ${fN(G.rueRate)} CHF/kWc dès 150 kWc (enchère Pronovo, non garantie).` : 'RUE non obtenue : l\'injection totale ne reçoit que la RU ordinaire.') : ''} Comparaison avec V1, V2, V3 telles que réglées dans le reste du site.
    Grille : pas de ${fN(OP.step)} kWc et ${fN(OP.bstep)} kWh — affinez avec le configurateur (bouton ci-contre).</p>`;
  const top = cells.slice().sort((a,b) => opVal(b) - opVal(a)).slice(0, 10);
  document.getElementById('opTop').innerHTML = `<thead><tr><th>#</th><th>RU (kWc)</th><th>RUE (kWc)</th><th>Total</th><th>Batterie</th><th>Prix</th><th>RU + RUE</th><th>Recettes 1re année</th><th>Payée après</th><th>${crit.t()}</th></tr></thead><tbody>` +
    top.map((c,k) => `<tr class="${k===0?'hl':''}"><td>${k+1}</td><td>${fN(c.ru)}</td><td>${fN(c.rue)}</td><td>${fN(c.ru+c.rue)}</td><td>${c.bat ? fN(c.bat)+' kWh' : '–'}</td><td>${fCHF(c.price)}</td><td>${fCHF(c.sub)}</td><td>${fCHF(c.y1)}</td><td>${c.pay != null ? fN(c.pay,1)+' ans' : '–'}</td><td>${fmt(opVal(c))}</td></tr>`).join('') + '</tbody>';
  document.getElementById('opApply').onclick = () => {
    Object.assign(CF, {kwc: tot, ac: Math.round(best.ru/tot*100), bat: best.bat, kwOv: null, base: 1, fix: null});
    document.querySelector('.tab[data-tab=bat]').click();
    setTimeout(() => { renderCF(); document.querySelector('.sech').scrollIntoView({behavior:'smooth'}); }, 200);
  };
}
let opTyping = null;
const opLater = fn => { clearTimeout(opTyping); opTyping = setTimeout(fn, 700); };
['roof','step','bmax','bstep'].forEach(k => { const el = document.getElementById('op_' + k); if (el) el.oninput = el.onchange = () => { const x = parseFloat(el.value); if (isFinite(x) && x > 0){ OP[k] = x; opLater(renderOP); } }; });
[['yAc','op_yAc'],['yRue','op_yRue'],['pKwc','op_pKwc']].forEach(([k,id]) => { const el = document.getElementById(id); el.oninput = el.onchange = () => { const x = parseFloat(el.value); if (isFinite(x) && x > 0){ CF[k] = x; opLater(renderOP); } }; });
document.getElementById('op_perKwh').oninput = document.getElementById('op_perKwh').onchange = e => { const x = parseFloat(e.target.value); if (isFinite(x) && x > 0){ BS.perKwh = x; opLater(renderOP); } };
document.querySelectorAll('#opCrit button').forEach(b => b.onclick = () => { OP.crit = b.dataset.c; if (opSetResult()){ renderCards(); renderComp(); } renderOP(); });
document.querySelectorAll('#opMode3 button').forEach(b => b.onclick = () => { OP.mode3 = b.dataset.m; renderOP(); });
document.getElementById('opView').onchange = e => { OP.view = e.target.value; drawOP(); };
document.getElementById('opCam').onclick = () => { opCamRev++; drawOP(); };
document.getElementById('opGo').onclick = () => { opData = null; renderOP(true); };


/* ---------------- Analyse 3D : tapis de l'année, site en 3D, flux d'énergie ---------------- */
const A3 = {v: 1, q: 'grid', top: false, day: '2026-06-25', qh: 52, zone: null, play: false};
const A3Q = {load:{t:'Consommation de l\'usine', u:'kW'}, pv:{t:'Production solaire (partie autoconsommation)', u:'kW'}, grid:{t:'Soutirage au réseau', u:'kW'},
  exp:{t:'Surplus revendu', u:'kW'}, cut:{t:'Pointe écrêtée par la batterie', u:'kW'}, soc:{t:'État de charge de la batterie', u:'kWh'}};
const a3font = {family:'Helvetica Neue, Arial, sans-serif', size:12, color:'#1a1a19'};
const a3scale = [[0,'#f4f1ea'],[0.35,'#8fb3d6'],[0.7,'#2a5c8a'],[1,'#132a40']];
function a3Tabs(){
  const mk = (id, items, cur, cb) => { const el = document.getElementById(id); if (!el) return; el.innerHTML = items.map(([k,t]) => `<button data-k="${k}" class="${String(k)===String(cur)?'on':''}">${t}</button>`).join(''); el.querySelectorAll('button').forEach(b => b.onclick = () => cb(b.dataset.k)); };
  mk('a3Var', V.map((v,i)=>[i, v.name.split(' · ')[0]]), A3.v, k => { A3.v = +k; renderA3(); });
  mk('a3Q', Object.entries(A3Q).map(([k,o])=>[k, o.t.split(' (')[0]]), A3.q, k => { A3.q = k; renderA3(); });
  mk('a3Top', [[0,'Relief 3D'],[1,'Vue de dessus']], A3.top?1:0, k => { A3.top = k === '1'; renderA3(); });
  mk('a3Var2', V.map((v,i)=>[i, v.name]), A3.v, k => { A3.v = +k; A3.zone = null; renderA3(); });
}
function renderA3(){
  if (!document.getElementById('tab-a3').classList.contains('active')) return;
  a3Tabs();
  const d = document.getElementById('a3Day'); if (document.activeElement !== d) d.value = A3.day;
  const q = document.getElementById('a3Qh'); if (document.activeElement !== q) q.value = A3.qh;
  loadPlotly(() => { drawCarpet(); drawSite(); });
  drawFlow();
}
// 1) Tapis de l'année : jours × heures × puissance
function drawCarpet(){
  const r = RES[A3.v], S = YEAR, a = r.r, v = r.v, q = A3.q, nd = Math.floor(S.n/96);
  const Z = Array.from({length:24}, () => new Array(nd).fill(0)), TH = Array.from({length:24}, () => new Array(nd).fill(null));
  const days = [], ticks = [], tickt = [], MO = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const val = i => q === 'load' ? S.load[i] : q === 'pv' ? v.prodAc*S.pv[i] : q === 'grid' ? Math.max(a.grid[i], 0) : q === 'exp' ? Math.max(-a.grid[i], 0) : q === 'soc' ? a.soc[i] : (a.kind[i] === 3 ? a.dis15[i] : 0);
  for (let d = 0; d < nd; d++){
    const dt = new Date(S.t0 + d*86400000); days.push(dt.toISOString().slice(0,10));
    if (dt.getUTCDate() === 1){ ticks.push(d); tickt.push(MO[dt.getUTCMonth()] + ' ' + String(dt.getUTCFullYear()).slice(2)); }
    for (let h = 0; h < 24; h++){
      let s = 0, mx = 0, t = null;
      for (let k = 0; k < 4; k++){ const i = d*96 + h*4 + k, x = val(i); s += x; mx = Math.max(mx, x); if (q === 'grid' && r.hasBat && r.mode === 0 && isFinite(a.thr[i])) t = Math.max(t ?? 0, a.thr[i]); }
      Z[h][d] = (q === 'grid' || q === 'cut') ? mx : s/4; TH[h][d] = t;
    }
  }
  const o = A3Q[q], hrs = Array.from({length:24}, (_,h) => h), hov = `%{customdata}<br>%{y}h : <b>%{z:,.0f} ${o.u}</b><extra></extra>`, cd = hrs.map(() => days);
  const traces = A3.top
    ? [{type:'heatmap', x:days.map((_,d)=>d), y:hrs, z:Z, customdata:cd, colorscale:a3scale, hovertemplate:hov, colorbar:{title:{text:o.u}, thickness:12}}]
    : [{type:'surface', x:days.map((_,d)=>d), y:hrs, z:Z, customdata:cd, colorscale:a3scale, hovertemplate:hov, colorbar:{title:{text:o.u}, thickness:12}, lighting:{ambient:0.8, diffuse:0.5, specular:0.05}}];
  if (q === 'grid' && !A3.top && r.hasBat && r.mode === 0) traces.push({type:'surface', x:days.map((_,d)=>d), y:hrs, z:TH, opacity:0.35, showscale:false, colorscale:[[0,'#b3261e'],[1,'#b3261e']], hoverinfo:'skip'});
  const xa = {title:{text:'Jour de l\'année (oct. 2025 → sept. 2026)'}, tickvals:ticks, ticktext:tickt}, ya = {title:{text:'Heure'}, tickvals:[0,6,12,18,23], ticktext:['0h','6h','12h','18h','23h']};
  Plotly.react('a3Carpet', traces, A3.top
    ? {margin:{l:60,r:20,t:10,b:50}, height:430, font:a3font, xaxis:xa, yaxis:ya, uirevision:'carpet'}
    : {margin:{l:0,r:0,t:0,b:0}, height:560, font:a3font, uirevision:'carpet', scene:{xaxis:xa, yaxis:ya, zaxis:{title:{text:o.u}}, aspectratio:{x:2.4, y:1, z:0.7}, camera:{eye:{x:-1.2, y:-2.0, z:1.1}}, dragmode:'turntable'}},
    {responsive:true, displaylogo:false, scrollZoom:false});
  const T = {load:'Les crêtes du matin en hiver et les journées de semaine ressortent ; le week-end forme des creux réguliers.',
    pv:'La production monte en été et en milieu de journée ; les journées grises font des creux.',
    grid:`Chaque pic est soutiré au réseau. ${r.hasBat && r.mode===0 ? 'La nappe rouge transparente est le seuil de pointe du mois : tout ce qui la dépasse est facturé comme pointe. ' : ''}Le solaire creuse la mi-journée, surtout en été.`,
    exp:'Le surplus revendu apparaît en milieu de journée, surtout les week-ends d\'été quand l\'usine consomme peu.',
    cut:'Chaque pic montre un moment où la batterie coupe une pointe : surtout tôt le matin et le soir, et davantage en hiver.',
    soc:'Bleu foncé = batterie pleine, clair = vide. On voit les jours d\'hiver où elle se vide sur les pointes et met du temps à se recharger au soleil.'};
  document.getElementById('a3CarpetTxt').textContent = `${r.v.name} · ${o.t}, ${q==='grid'||q==='cut' ? 'maximum de chaque heure' : 'moyenne de chaque heure'}. ${T[q]}`;
}
// ---- instant choisi (jour + quart d'heure) ----
function a3Index(){
  const d = A3.day, S = YEAR;
  let i0 = Math.round((Date.UTC(+d.slice(0,4), +d.slice(5,7)-1, +d.slice(8,10)) - S.t0)/900000);
  i0 = Math.max(0, Math.min(S.n - 96, i0)); return i0 + Math.max(0, Math.min(95, A3.qh));
}
function a3Now(){
  const r = RES[A3.v], S = YEAR, a = r.r, v = r.v, i = a3Index(), k = a.kind[i];
  const L = S.load[i], P = v.prodAc*S.pv[i], Prue = v.prodRue*S.pv[i], y = a.grid[i], c = a.ch[i], d = a.dis15[i];
  const shape = S.pv[i] / Math.max(...Array.from({length:96}, (_,q) => S.pv[i - (i % 96) + q] || 0), 1e-9);
  return {r, i, L, P, Prue, direct: Math.min(L, P), sunBat: k === 1 ? c : 0, gridBat: k === 2 ? c : 0, batPeak: k === 3 ? d : 0, batAc: k === 4 ? d : 0,
    exp: Math.max(-y, 0), imp: Math.max(y, 0), soc: a.soc[i], cap: r.cap, thr: r.hasBat && r.mode === 0 && isFinite(a.thr[i]) ? a.thr[i] : null, shape, pvMax: S.pv[i]};
}
function a3TimeTxt(){
  const i = a3Index(), d = new Date(YEAR.t0 + i*900000);
  return `${['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth()+1}.${d.getUTCFullYear()} à ${String(d.getUTCHours()).padStart(2,'0')}h${String(d.getUTCMinutes()).padStart(2,'0')}`;
}
// Position du soleil à Moudon (46,67° N, 6,80° E), heure locale suisse
function sunPos(i){
  const loc = YEAR.t0 + i*900000, dl = new Date(loc), y = dl.getUTCFullYear();
  const lastSun = (m) => { const t = new Date(Date.UTC(y, m+1, 0)); return Date.UTC(y, m, t.getUTCDate() - t.getUTCDay(), 1); };
  const utcGuess = loc - 3600000, dst = utcGuess >= lastSun(2) && utcGuess < lastSun(9);
  const t = loc - (dst ? 2 : 1)*3600000, n = t/86400000 + 2440587.5 - 2451545, rad = Math.PI/180;
  const g = (357.529 + 0.98560028*n)*rad, q = 280.459 + 0.98564736*n, Lm = (q + 1.915*Math.sin(g) + 0.020*Math.sin(2*g))*rad, e = (23.439 - 0.00000036*n)*rad;
  const ra = Math.atan2(Math.cos(e)*Math.sin(Lm), Math.cos(Lm)), dec = Math.asin(Math.sin(e)*Math.sin(Lm));
  const gmst = (18.697374558 + 24.06570982441908*n) % 24, H = ((gmst + 6.80/15)*15)*rad - ra, lat = 46.67*rad;
  const el = Math.asin(Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec)*Math.cos(lat) - Math.sin(lat)*Math.cos(H));
  return {el: el/rad, az: ((az/rad) + 360) % 360};
}
// ---- 2) Le site en 3D, géoréférencé (emprise swisstopo VECTOR25 + photo aérienne SWISSIMAGE) ----
// Repère local en mètres : origine LV95 E 2'551'052 / N 1'168'352 (angle ouest de l'usine), x vers le sud-est (azimut 124,44°), y vers le nord-est (azimut 34,44°).
// Zones de panneaux reportées depuis les photomontages du 03.11.2026 sur l'emprise réelle. Hauteurs des bâtiments indicatives.
const SITE_B = [
  {n:'Halle principale', r:[25,124,22,178], h:10}, {n:'Halle nord-ouest (sheds)', r:[0,25,22,178], h:9},
  {n:'Bâtiment sud-ouest', r:[34,124,-34,22], h:8}, {n:'Annexe', r:[0,30,0,22], h:5}];
const SITE_Z = [
  {id:'S1', mod:103, m2:210.3, ori:'Nord-Est', kwc:[50.6,50.6,50.6], role:['rue','ru','ru'], r:[101.5,124,165.6,178], h:10},
  {id:'S2–S4', mod:207, m2:422.5, ori:'Sheds Est-Ouest', kwc:[101.43,101.43,101.43], role:['rue','ru','ru'], r:[34,83.5,168.1,178], h:10},
  {id:'S5', mod:452, m2:922.6, ori:'Sheds Est-Ouest', kwc:[221.48,221.48,221.48], role:['rue','ru','ru'], r:[18.2,25,22,178], h:9},
  {id:'S6', mod:1240, m2:2531.1, ori:'Sheds Est-Ouest', kwc:[607.6,607.6,607.6], role:['rue','ru','ru'], r:[0,18.2,22,178], h:9},
  {id:'S7', mod:217, m2:442.9, ori:'Sud-Ouest', kwc:[106.3,106.3,106.3], role:['rue','ru','ru'], r:[0,30,0,22], h:5},
  {id:'S8–S9', mod:892, m2:1820.8, ori:'Nord-Ouest / Sud-Est', kwc:[437.1,437.1,437.1], role:['rue','ru','ru'], r:[34,79,-9.5,22], h:8},
  {id:'S10', mod:696, m2:1420.7, ori:'Sud-Ouest', kwc:[341,341,341], role:['rue','ru','ru'], r:[34,79,-34,-9.5], h:8},
  {id:'S11', mod:696, m2:1420.7, ori:'Nord-Est', kwc:[341,341,341], role:['rue','ru','ru'], r:[82.9,124,-11.9,14.9], h:8},
  {id:'S12–S35', mod:1110, m2:2265.7, ori:'Sud-Ouest', kwc:[543.9,543.9,705.6], role:['rue','ru','ru'], r:[93.6,124,56.7,164.4], h:10, note3:'V3 : 1\'440 modules, 2\'939 m², 705,6 kWc'},
  {id:'S36–S43.1', mod:488, m2:996.1, ori:'Sud-Ouest', kwc:[239.1,239.1,0], role:['rue','ru','off'], r:[79,124,24.5,55.4], h:10},
  {id:'S43.2–S76', mod:2052, m2:4188.5, ori:'Sud-Ouest', kwc:[1005.5,1005.5,0], role:['ru','ru','off'], r:[31.8,92.5,71.5,166.9], h:10},
  {id:'S77–S83', mod:420, m2:857.3, ori:'Sud-Ouest', kwc:[205.8,205.8,0], role:['rue','ru','off'], r:[31.8,79,45.5,70.3], h:10}];
const ROLE = {ru:{t:'Autoconsommation (RU)', c:'#2a78d6'}, rue:{t:'Injection totale (RUE)', c:'#1baf7a'}, off:{t:'Pas de panneaux dans cette variante', c:'#c9c7c0'}};
function box(x0,x1,y0,y1,z0,z1){
  return {x:[x0,x1,x1,x0,x0,x1,x1,x0], y:[y0,y0,y1,y1,y0,y0,y1,y1], z:[z0,z0,z0,z0,z1,z1,z1,z1],
    i:[0,0,4,4,0,0,1,1,2,2,3,3], j:[1,2,5,6,1,5,2,6,3,7,0,4], k:[2,3,6,7,5,4,6,5,7,6,4,7]};
}
// Fusionne plusieurs maillages en un seul (moins de traces, plus rapide)
function meshJoin(list){ const o = {x:[], y:[], z:[], i:[], j:[], k:[]}; list.forEach(m => { const n = o.x.length; o.x.push(...m.x); o.y.push(...m.y); o.z.push(...m.z); o.i.push(...m.i.map(v=>v+n)); o.j.push(...m.j.map(v=>v+n)); o.k.push(...m.k.map(v=>v+n)); }); return o; }
const quad = (p) => ({x:p.map(q=>q[0]), y:p.map(q=>q[1]), z:p.map(q=>q[2]), i:[0,0], j:[1,2], k:[2,3]});
// Rangées de panneaux selon l'orientation : mono-pente (Sud-Ouest = vers −y, Nord-Est = vers +y) ou sheds en toit (Est-Ouest = faîtages le long de y, NO/SE = le long de x)
function panelRows(z, lift){
  const [x0,x1,y0,y1] = [z.r[0]+0.8, z.r[1]-0.8, z.r[2]+0.8, z.r[3]-0.8], h = z.h + 0.35, out = [];
  if (/Sheds|Nord-Ouest/.test(z.ori)){
    const alongY = /Sheds/.test(z.ori), w = 4.6, rise = 0.9, a0 = alongY ? x0 : y0, a1 = alongY ? x1 : y1;
    for (let a = a0; a + w <= a1 + 0.01; a += w + 0.5){
      const m = a + w/2, e = a + w, P = (u, v, zz) => alongY ? [u, v, zz] : [v, u, zz], b0 = alongY ? y0 : x0, b1 = alongY ? y1 : x1;
      out.push(quad([P(a,b0,h), P(a,b1,h), P(m,b1,h+rise*lift), P(m,b0,h+rise*lift)]));
      out.push(quad([P(m,b0,h+rise*lift), P(m,b1,h+rise*lift), P(e,b1,h), P(e,b0,h)]));
    }
  } else {
    const sw = !/Nord-Est/.test(z.ori), d = 2.3, pitch = 3.4, rise = 0.65;
    for (let y = y0; y + d <= y1 + 0.01; y += pitch){
      const lo = sw ? y : y + d, hi = sw ? y + d : y;
      out.push(quad([[x0,lo,h],[x1,lo,h],[x1,hi,h+rise*lift],[x0,hi,h+rise*lift]]));
    }
  }
  return out.length ? meshJoin(out) : box(x0,x1,y0,y1,h,h+0.2);
}
function mixC(a, b, t){ const p = h => [1,3,5].map(k => parseInt(h.slice(k,k+2),16)); const A = p(a), B = p(b); return '#' + A.map((x,k) => Math.round(x + (B[k]-x)*t).toString(16).padStart(2,'0')).join(''); }
// ---- Données géographiques réelles (chargées dans le navigateur depuis swisstopo, sans clé) ----
const GEO = {E0:2551052, N0:1168352, az:34.44, h0:511.9, X:[-180,310], Y:[-200,380], st:'idle', d:null, msg:''};
const GEO_A = GEO.az*Math.PI/180, GEO_B = GEO_A + Math.PI/2;
function l2g(x, y){ return [GEO.E0 + x*Math.sin(GEO_B) + y*Math.sin(GEO_A), GEO.N0 + x*Math.cos(GEO_B) + y*Math.cos(GEO_A)]; }
function g2l(E, N){ const dx = E - GEO.E0, dy = N - GEO.N0; return [dx*Math.sin(GEO_B) + dy*Math.cos(GEO_B), dx*Math.sin(GEO_A) + dy*Math.cos(GEO_A)]; }
// LV95 → WGS84 (formules approchées swisstopo, précision ~1 m)
function lv95wgs(E, N){
  const y = (E - 2600000)/1e6, x = (N - 1200000)/1e6;
  const lon = 2.6779094 + 4.728982*y + 0.791484*y*x + 0.1306*y*x*x - 0.0436*y*y*y;
  const lat = 16.9023892 + 3.238272*x - 0.270978*y*y - 0.002528*x*x - 0.0447*y*y*x - 0.0140*x*x*x;
  return [lon*100/36, lat*100/36];
}
// Triangulation d'un polygone simple (découpe des oreilles)
function earcut2(P){
  const n0 = P.length, ar = P.reduce((s, p, i) => { const q = P[(i+1)%n0]; return s + p[0]*q[1] - q[0]*p[1]; }, 0);
  let idx = P.map((_, i) => i); if (ar < 0) idx.reverse();
  const cr = (a, b, c) => (P[b][0]-P[a][0])*(P[c][1]-P[a][1]) - (P[b][1]-P[a][1])*(P[c][0]-P[a][0]);
  const inT = (p, a, b, c) => cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0;
  const T = []; let guard = 0;
  while (idx.length > 3 && guard++ < 10000){
    let cut = false; const n = idx.length;
    for (let i = 0; i < n; i++){
      const a = idx[(i+n-1)%n], b = idx[i], c = idx[(i+1)%n];
      if (cr(a, b, c) <= 1e-9) continue;
      if (idx.some(p => p !== a && p !== b && p !== c && inT(p, a, b, c))) continue;
      T.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) T.push(idx);
  return T;
}
async function geoLoad(){
  if (GEO.st !== 'idle') return;
  GEO.st = 'loading'; GEO.msg = 'Chargement de la photo aérienne et du relief swisstopo…'; setTimeout(drawSite, 0);
  try {
    const cs = [[GEO.X[0],GEO.Y[0]],[GEO.X[1],GEO.Y[0]],[GEO.X[1],GEO.Y[1]],[GEO.X[0],GEO.Y[1]]].map(p => l2g(p[0], p[1]));
    const bx = [Math.floor(Math.min(...cs.map(c=>c[0]))) - 10, Math.floor(Math.min(...cs.map(c=>c[1]))) - 10, Math.ceil(Math.max(...cs.map(c=>c[0]))) + 10, Math.ceil(Math.max(...cs.map(c=>c[1]))) + 10];
    const W = 1400, H = Math.round(W*(bx[3]-bx[1])/(bx[2]-bx[0]));
    const wms = `https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:2056&BBOX=${bx.join(',')}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`;
    // relief : 13 profils parallèles de 17 points (modèle de terrain swissALTI3D / DHM25)
    const NX = 17, NY = 13, xs = [...Array(NX)].map((_, k) => GEO.X[0] + k*(GEO.X[1]-GEO.X[0])/(NX-1)), ys = [...Array(NY)].map((_, k) => GEO.Y[0] + k*(GEO.Y[1]-GEO.Y[0])/(NY-1));
    const prof = ys.map(y => { const g = JSON.stringify({type:'LineString', coordinates:[l2g(GEO.X[0], y), l2g(GEO.X[1], y)].map(p => p.map(v => Math.round(v*10)/10))});
      return fetch(`https://api3.geo.admin.ch/rest/services/profile.json?sr=2056&nb_points=${NX}&geom=${encodeURIComponent(g)}`).then(r => r.json()); });
    const idf = fetch(`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryEnvelope&geometry=${bx.join(',')}&imageDisplay=1000,1000,96&mapExtent=${bx.join(',')}&tolerance=0&sr=2056&geometryFormat=geojson&returnGeometry=true&limit=200&layers=all:ch.swisstopo.vec25-gebaeude`).then(r => r.json()).catch(() => ({results:[]}));
    const img = await fetch(wms).then(r => { if (!r.ok) throw new Error('wms'); return r.blob(); }).then(b => createImageBitmap(b));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data;
    const PR = await Promise.all(prof);
    const Hg = PR.map(p => { const a = p.map(q => (q.alts && (q.alts.COMB ?? q.alts.DTM2 ?? q.alts.DTM25)) ?? GEO.h0); while (a.length < NX) a.push(a[a.length-1] ?? GEO.h0); return a.slice(0, NX); });
    const inFoot = (x, y, m) => SITE_B.some(b => x > b.r[0]-m && x < b.r[1]+m && y > b.r[2]-m && y < b.r[3]+m);
    const zAt = (x, y) => { const fx = Math.max(0, Math.min(NX-1.001, (x-GEO.X[0])/(GEO.X[1]-GEO.X[0])*(NX-1))), fy = Math.max(0, Math.min(NY-1.001, (y-GEO.Y[0])/(GEO.Y[1]-GEO.Y[0])*(NY-1)));
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      return (Hg[j][i]*(1-u)*(1-v) + Hg[j][i+1]*u*(1-v) + Hg[j+1][i]*(1-u)*v + Hg[j+1][i+1]*u*v) - GEO.h0; };
    const col = (x, y, d) => { const [E, N] = l2g(x, y), cxp = (E - bx[0])/(bx[2]-bx[0])*W, cyp = (bx[3] - N)/(bx[3]-bx[1])*H; let r = 0, g = 0, b = 0, n = 0;
      for (let a = -d; a <= d; a += Math.max(1, d)) for (let c = -d; c <= d; c += Math.max(1, d)){ const X = Math.round(cxp + a), Y = Math.round(cyp + c); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const o = (Y*W + X)*4; r += px[o]; g += px[o+1]; b += px[o+2]; n++; }
      return n ? `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})` : 'rgb(200,205,190)'; };
    // sol texturé
    const st = 3.5, gx = Math.floor((GEO.X[1]-GEO.X[0])/st) + 1, gy = Math.floor((GEO.Y[1]-GEO.Y[0])/st) + 1, G = {x:[], y:[], z:[], i:[], j:[], k:[], c:[]};
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++){
      const x = GEO.X[0] + i*st, y = GEO.Y[0] + j*st; let z = zAt(x, y); if (inFoot(x, y, 2.5)) z = Math.min(z, -0.15);
      G.x.push(x); G.y.push(y); G.z.push(z); G.c.push(col(x, y, 2));
      if (i < gx-1 && j < gy-1){ const a = j*gx + i; G.i.push(a, a); G.j.push(a+1, a+gx+1); G.k.push(a+gx+1, a+gx); }
    }
    // toitures de l'usine texturées avec la photo aérienne
    const R = {x:[], y:[], z:[], i:[], j:[], k:[], c:[]};
    SITE_B.forEach(b => { const s2 = 2, nx = Math.max(2, Math.round((b.r[1]-b.r[0])/s2) + 1), ny = Math.max(2, Math.round((b.r[3]-b.r[2])/s2) + 1), o = R.x.length;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){ const x = b.r[0] + i*(b.r[1]-b.r[0])/(nx-1), y = b.r[2] + j*(b.r[3]-b.r[2])/(ny-1);
        R.x.push(x); R.y.push(y); R.z.push(b.h + 0.03); R.c.push(col(x, y, 1));
        if (i < nx-1 && j < ny-1){ const a = o + j*nx + i; R.i.push(a, a); R.j.push(a+1, a+nx+1); R.k.push(a+nx+1, a+nx); } } });
    // bâtiments voisins : emprises VECTOR25 extrudées (hauteur estimée selon la surface)
    const nb = {x:[], y:[], z:[], zb:[], i:[], j:[], k:[], c:[]}, nbTxt = []; let nN = 0;
    ((await idf).results || []).forEach(f => {
      const gm = f.geometry || {}, polys = gm.type === 'MultiPolygon' ? gm.coordinates : gm.type === 'Polygon' ? [gm.coordinates] : [];
      polys.forEach(pl => {
        let P = (pl[0] || []).map(c => g2l(c[0], c[1])); if (P.length > 1 && Math.hypot(P[0][0]-P[P.length-1][0], P[0][1]-P[P.length-1][1]) < 0.01) P.pop();
        if (P.length < 3) return;
        const cxl = P.reduce((s, p) => s + p[0], 0)/P.length, cyl = P.reduce((s, p) => s + p[1], 0)/P.length;
        if (cxl > -5 && cxl < 130 && cyl > -40 && cyl < 185) return;                  // l'usine elle-même
        if (cxl < GEO.X[0] || cxl > GEO.X[1] || cyl < GEO.Y[0] || cyl > GEO.Y[1]) return;
        const area = Math.abs(P.reduce((s, p, i) => { const q = P[(i+1)%P.length]; return s + p[0]*q[1] - q[0]*p[1]; }, 0))/2;
        const hgt = area < 250 ? 6.5 : area < 1200 ? 9 : 11, z0 = Math.min(...P.map(p => zAt(p[0], p[1]))) - 0.3, o = nb.x.length, n = P.length;
        const roofC = col(cxl, cyl, 3), wallC = '#d8d4cc';
        P.forEach(p => { nb.x.push(p[0], p[0]); nb.y.push(p[1], p[1]); nb.z.push(z0, z0 + 0.3 + hgt); nb.zb.push(z0, z0); nb.c.push(wallC, roofC); });
        for (let i = 0; i < n; i++){ const a = o + 2*i, b = o + 2*((i+1)%n); nb.i.push(a, a); nb.j.push(b, b+1); nb.k.push(b+1, a+1); }
        earcut2(P).forEach(t => { nb.i.push(o + 2*t[0] + 1); nb.j.push(o + 2*t[1] + 1); nb.k.push(o + 2*t[2] + 1); });
        nN++;
      });
    });
    GEO.d = {G, R, nb, nN, foot:bx};
    GEO.st = 'ok'; GEO.msg = '';
  } catch (e){
    GEO.st = 'err'; GEO.msg = 'Photo aérienne swisstopo indisponible (connexion ?) : affichage schématique.';
  }
  drawSite();
}
// Relief élargi : maillage plus grossier autour du site (photo aérienne + relief), chargé à la demande
const GEO_SIZES = {site:{t:'Site (0,5 km)', s:0}, quartier:{t:'Quartier (1,5 km)', s:1500, nx:23, img:1600}, vallee:{t:'Vallée (4 km)', s:4000, nx:31, img:2000}};
GEO.size = 'site'; GEO.ex = 1; GEO.o = {};
async function geoLoadOuter(key){
  const S = GEO_SIZES[key]; if (!S.s || GEO.o[key]) return;
  GEO.o[key] = {st:'loading'}; GEO.msg = `Chargement du relief élargi (${S.t})…`; setTimeout(drawSite, 0);
  try {
    const cxm = 62, cym = 72, X = [cxm - S.s/2, cxm + S.s/2], Y = [cym - S.s/2, cym + S.s/2];
    const cs = [[X[0],Y[0]],[X[1],Y[0]],[X[1],Y[1]],[X[0],Y[1]]].map(p => l2g(p[0], p[1]));
    const bx = [Math.floor(Math.min(...cs.map(c=>c[0]))), Math.floor(Math.min(...cs.map(c=>c[1]))), Math.ceil(Math.max(...cs.map(c=>c[0]))), Math.ceil(Math.max(...cs.map(c=>c[1])))];
    const W = S.img, H = Math.round(W*(bx[3]-bx[1])/(bx[2]-bx[0]));
    const NX = S.nx, NY = S.nx, ys = [...Array(NY)].map((_, k) => Y[0] + k*(Y[1]-Y[0])/(NY-1));
    const prof = ys.map(y => { const g = JSON.stringify({type:'LineString', coordinates:[l2g(X[0], y), l2g(X[1], y)].map(p => p.map(v => Math.round(v*10)/10))});
      return fetch(`https://api3.geo.admin.ch/rest/services/profile.json?sr=2056&nb_points=${NX}&geom=${encodeURIComponent(g)}`).then(r => r.json()); });
    const img = await fetch(`https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:2056&BBOX=${bx.join(',')}&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`).then(r => { if (!r.ok) throw new Error('wms'); return r.blob(); }).then(b => createImageBitmap(b));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
    const px = cx.getImageData(0, 0, W, H).data;
    const Hg = (await Promise.all(prof)).map(p => { const a = p.map(q => (q.alts && (q.alts.COMB ?? q.alts.DTM2 ?? q.alts.DTM25)) ?? GEO.h0); while (a.length < NX) a.push(a[a.length-1] ?? GEO.h0); return a.slice(0, NX); });
    const zAt = (x, y) => { const fx = Math.max(0, Math.min(NX-1.001, (x-X[0])/(X[1]-X[0])*(NX-1))), fy = Math.max(0, Math.min(NY-1.001, (y-Y[0])/(Y[1]-Y[0])*(NY-1)));
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      return (Hg[j][i]*(1-u)*(1-v) + Hg[j][i+1]*u*(1-v) + Hg[j+1][i]*(1-u)*v + Hg[j+1][i+1]*u*v) - GEO.h0; };
    const col = (x, y) => { const [E, N] = l2g(x, y), cxp = (E - bx[0])/(bx[2]-bx[0])*W, cyp = (bx[3] - N)/(bx[3]-bx[1])*H; let r = 0, g = 0, b = 0, n = 0;
      for (let a = -3; a <= 3; a += 3) for (let c = -3; c <= 3; c += 3){ const Xp = Math.round(cxp + a), Yp = Math.round(cyp + c); if (Xp < 0 || Yp < 0 || Xp >= W || Yp >= H) continue; const o = (Yp*W + Xp)*4; r += px[o]; g += px[o+1]; b += px[o+2]; n++; }
      return n ? `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})` : 'rgb(200,205,190)'; };
    const st = S.s/150, g = Math.round(S.s/st) + 1, G = {x:[], y:[], z:[], i:[], j:[], k:[], c:[]};
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++){ const x = X[0] + i*st, y = Y[0] + j*st; G.x.push(x); G.y.push(y); G.z.push(zAt(x, y) - 0.4); G.c.push(col(x, y)); }
    // on ne garde que les mailles qui débordent de la zone détaillée (évite les doublons)
    for (let j = 0; j < g-1; j++) for (let i = 0; i < g-1; i++){
      const x0 = X[0] + i*st, y0 = Y[0] + j*st; if (x0 >= GEO.X[0] && x0 + st <= GEO.X[1] && y0 >= GEO.Y[0] && y0 + st <= GEO.Y[1]) continue;
      const a = j*g + i; G.i.push(a, a); G.j.push(a+1, a+g+1); G.k.push(a+g+1, a+g); }
    GEO.o[key] = {st:'ok', X, Y, G, zmin:Math.min(...G.z), zmax:Math.max(...G.z)};
    GEO.msg = '';
  } catch (e){ GEO.o[key] = {st:'err'}; GEO.msg = 'Relief élargi indisponible pour le moment (connexion ?).'; }
  drawSite();
}
// Exagération du relief (multiplie les hauteurs du terrain, pas les bâtiments)
function geoEx(m, key){ if (GEO.ex === 1) return m.z; m._ex = m._ex || {}; return m._ex[GEO.ex] || (m._ex[GEO.ex] = m.z.map((z, k) => z + (GEO.ex - 1)*(m.zb ? m.zb[k] : z))); }
// Export KML : zones de panneaux de la variante affichée, à ouvrir dans Google Earth
function siteKml(){
  const vi = A3.v, V = ['V1','V2','V3'][vi], kc = {ru:'ffd6782a', rue:'ff7aaf1b', off:'ffc0c7c9'};
  const pm = SITE_Z.map(z => { const r = z.r, role = z.role[vi];
    const ring = [[r[0],r[2]],[r[1],r[2]],[r[1],r[3]],[r[0],r[3]],[r[0],r[2]]].map(p => { const [E, N] = l2g(p[0], p[1]), [lo, la] = lv95wgs(E, N); return `${lo.toFixed(7)},${la.toFixed(7)},${(z.h + 0.5).toFixed(1)}`; }).join(' ');
    return `<Placemark><name>${z.id}</name><description>${ROLE[role].t}${role === 'off' ? '' : ` · ${fN(z.kwc[vi],1)} kWc · ${z.ori}`}</description><styleUrl>#${role}</styleUrl><Polygon><extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`; }).join('\n');
  const [lo0, la0] = lv95wgs(...l2g(62, 72));
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Model SA Moudon – panneaux ${V}</name>
<LookAt><longitude>${lo0.toFixed(6)}</longitude><latitude>${la0.toFixed(6)}</latitude><altitude>0</altitude><range>420</range><tilt>55</tilt><heading>20</heading></LookAt>
${Object.entries(kc).map(([k, c]) => `<Style id="${k}"><LineStyle><color>ff333333</color><width>1</width></LineStyle><PolyStyle><color>${c.replace(/^ff/, 'cc')}</color></PolyStyle></Style>`).join('')}
${pm}
</Document></kml>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([kml], {type:'application/vnd.google-earth.kml+xml'})); a.download = `Model_Moudon_panneaux_${V}.kml`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function drawSite(){
  if (!window.Plotly) return;
  const vi = A3.v, now = a3Now(), sun = sunPos(now.i), light = Math.max(0, Math.min(1, now.shape));
  const tr = [], M = (o, m) => tr.push(Object.assign({type:'mesh3d', flatshading:true, hoverinfo:'skip', lighting:{ambient:0.62, diffuse:0.75, specular:0.15, roughness:0.8}, lightposition:{x:-1000, y:-2000, z:3000}}, o, m));
  // environnement : terrain, routes, parking, voie ferrée, voisins
  let geoView = null;
  if (A3.geo !== false && GEO.st === 'idle') geoLoad();
  const geoOn = A3.geo !== false && GEO.st === 'ok';
  if (geoOn){
    const d = GEO.d, ph = {flatshading:false, lighting:{ambient:0.92, diffuse:0.18, specular:0, roughness:1}};
    if (GEO.size !== 'site' && !GEO.o[GEO.size]) geoLoadOuter(GEO.size);
    const ou = GEO.size !== 'site' && GEO.o[GEO.size] && GEO.o[GEO.size].st === 'ok' ? GEO.o[GEO.size] : null;
    if (ou) M(Object.assign({vertexcolor:ou.G.c}, ph), {x:ou.G.x, y:ou.G.y, z:geoEx(ou.G), i:ou.G.i, j:ou.G.j, k:ou.G.k});
    M(Object.assign({vertexcolor:d.G.c}, ph), {x:d.G.x, y:d.G.y, z:geoEx(d.G), i:d.G.i, j:d.G.j, k:d.G.k});
    if (d.nb.x.length) M({vertexcolor:d.nb.c, hoverinfo:'text', text:new Array(d.nb.x.length).fill('Bâtiment voisin (emprise swisstopo, hauteur estimée)'), lighting:{ambient:0.7, diffuse:0.6, specular:0.05, roughness:0.9}}, {x:d.nb.x, y:d.nb.y, z:geoEx(d.nb), i:d.nb.i, j:d.nb.j, k:d.nb.k});
    geoView = ou ? {X:ou.X, Y:ou.Y, z0:Math.min(-20, ou.zmin*GEO.ex - 5), z1:Math.max(160, ou.zmax*GEO.ex + 10)} : {X:GEO.X, Y:GEO.Y, z0:-20, z1:160};
  } else {
    M({color:'#dfe6d6'}, box(-95,200,-110,280,-0.4,0));
    M({color:'#a9aaa3'}, box(-62,-48,-110,280,0,0.08)); M({color:'#c8c6bd'}, box(-48,-44,-110,280,0,0.06));
    M({color:'#a9aaa3'}, box(-95,200,-60,-50,0,0.08)); M({color:'#bdbab1'}, box(95,150,-48,40,0,0.06)); M({color:'#bdbab1'}, box(-40,-26,-30,55,0,0.06));
    M({color:'#8a8780'}, box(-82,-76,-110,280,0,0.25)); M({color:'#8a8780'}, box(-72,-66,-110,280,0,0.25));
    [[120,150,50,95,7],[140,185,-35,15,6],[-40,-25,200,230,6],[115,135,195,240,9]].forEach(n => M({color:'#ece9e2', hoverinfo:'text', text:new Array(8).fill('Bâtiment voisin (indicatif)')}, box(n[0],n[1],n[2],n[3],0,n[4])));
  }
  // bâtiments : volumes, façades vitrées, acrotères, lanterneaux
  SITE_B.forEach(b => {
    const [x0,x1,y0,y1] = b.r, hh = b.h;
    M({color:'#d9d6cf', hoverinfo:'text', text:new Array(8).fill(b.n)}, box(x0,x1,y0,y1,0,hh));
    M({color:'#5f6b75'}, meshJoin([box(x0-0.15,x1+0.15,y0-0.15,y0,hh*0.45,hh*0.62), box(x0-0.15,x1+0.15,y1,y1+0.15,hh*0.45,hh*0.62), box(x0-0.15,x0,y0,y1,hh*0.45,hh*0.62), box(x1,x1+0.15,y0,y1,hh*0.45,hh*0.62)]));
    M({color:'#efede7'}, meshJoin([box(x0,x1,y0,y0+0.5,hh,hh+0.9), box(x0,x1,y1-0.5,y1,hh,hh+0.9), box(x0,x0+0.5,y0,y1,hh,hh+0.9), box(x1-0.5,x1,y0,y1,hh,hh+0.9)]));
  });
  if (geoOn) M({vertexcolor:GEO.d.R.c, flatshading:false, lighting:{ambient:0.9, diffuse:0.2, specular:0, roughness:1}}, {x:GEO.d.R.x, y:GEO.d.R.y, z:GEO.d.R.z, i:GEO.d.R.i, j:GEO.d.R.j, k:GEO.d.R.k});
  M({color:'#2b2f33'}, meshJoin([box(57,61,140,144,10,10.9), box(74,78,112,116,10,10.9), box(100,104,150,154,10,10.9)]));
  M({color:'#7d8a8f'}, box(52,88,10,13,8,8.6));
  // arbres
  const trees = geoOn ? [] : [[150,120],[160,140],[170,100],[155,180],[175,160],[165,60],[-30,150],[-35,110],[-28,70],[130,-70],[100,-80],[60,-85],[-20,-80],[185,20],[178,200]];
  if (trees.length) tr.push({type:'scatter3d', mode:'markers', x:trees.map(t=>t[0]), y:trees.map(t=>t[1]), z:trees.map(()=>6), marker:{size:15, color:'#5d7f4a', opacity:0.95, line:{width:0}}, hoverinfo:'skip'});
  if (trees.length) tr.push({type:'scatter3d', mode:'markers', x:trees.map(t=>t[0]+3), y:trees.map(t=>t[1]-2), z:trees.map(()=>9), marker:{size:11, color:'#6f9457', opacity:0.95, line:{width:0}}, hoverinfo:'skip'});
  // panneaux : rangées inclinées selon l'orientation, couleur selon la variante, éclat selon la production
  const zoneIdx = [];
  SITE_Z.forEach((z, k) => {
    const role = z.role[vi], base = ROLE[role].c, col = A3.zone === k ? '#eda100' : role === 'off' ? base : mixC(mixC(base, '#0d1b2a', 0.55*(1 - light)), '#ffffff', 0.28*light);
    const txt = `${z.id} · ${ROLE[role].t}<br>${role === 'off' ? 'retiré en V3' : `${fN(z.kwc[vi],1)} kWc · ${z.ori}`}`;
    zoneIdx.push(tr.length);
    const geo = role === 'off' ? box(z.r[0]+0.8, z.r[1]-0.8, z.r[2]+0.8, z.r[3]-0.8, z.h, z.h + 0.12) : panelRows(z, 1);
    M({color: col, hoverinfo:'text', text:new Array(geo.x.length).fill(txt), lighting:{ambient:0.55, diffuse:0.85, specular:0.55, roughness:0.35, fresnel:0.3}}, geo);
  });
  // soleil (direction réelle) et nord
  const toLocal = (az) => [Math.cos((az - GEO.az - 90)*Math.PI/180), Math.cos((az - GEO.az)*Math.PI/180)];
  const cx = 55, cy = 80, R = geoView ? Math.max(150, 0.3*(geoView.X[1]-geoView.X[0])) : 150;
  if (sun.el > 0){
    const [dx, dy] = toLocal(sun.az), ce = Math.cos(sun.el*Math.PI/180), sz = Math.sin(sun.el*Math.PI/180);
    const sx = cx + R*ce*dx, sy = cy + R*ce*dy, szz = R*sz;
    tr.push({type:'scatter3d', mode:'lines', x:[sx, cx], y:[sy, cy], z:[szz, 10], line:{color:'#eda100', width:3, dash:'dash'}, hoverinfo:'skip'});
    tr.push({type:'scatter3d', mode:'markers+text', x:[sx], y:[sy], z:[szz], text:['Soleil'], textposition:'top center', marker:{size:14, color:'#ffcf33', line:{color:'#e09a00', width:2}}, hoverinfo:'text', hovertext:[`Soleil : hauteur ${fN(sun.el,0)}°, azimut ${fN(sun.az,0)}°`]});
  }
  const [nx, ny] = toLocal(0);
  tr.push({type:'scatter3d', mode:'lines+text', x:[-50, -50 + 30*nx], y:[215, 215 + 30*ny], z:[1, 1], text:['', 'N'], textposition:'top center', textfont:{size:16, color:'#b3261e'}, line:{color:'#b3261e', width:6}, hoverinfo:'skip'});
  const gv = geoView, gsx = gv ? gv.X[1]-gv.X[0] : 1, gsy = gv ? gv.Y[1]-gv.Y[0] : 1, gk = gv ? 1.5/Math.max(gsx, gsy) : 1, big = gv && gsx > 1000;
  const sc = geoOn ? {xaxis:{visible:false, range:gv.X}, yaxis:{visible:false, range:gv.Y}, zaxis:{visible:false, range:[gv.z0, gv.z1]}, aspectmode:'manual', aspectratio:{x:gsx*gk, y:gsy*gk, z:Math.max(0.12, (gv.z1-gv.z0)*gk)}, camera:big ? {eye:{x:-0.75, y:-0.95, z:0.65}, center:{x:0, y:0, z:-0.1}} : {eye:{x:-0.5, y:-0.62, z:0.42}, center:{x:-0.05, y:-0.08, z:-0.12}}, dragmode:'turntable', bgcolor:'#eef3f8'}
    : {xaxis:{visible:false, range:[-75,185]}, yaxis:{visible:false, range:[-85,255]}, zaxis:{visible:false, range:[-1, 155]}, aspectmode:'manual', aspectratio:{x:1.3, y:1.7, z:0.78}, camera:{eye:{x:-0.85, y:-0.95, z:0.55}, center:{x:0, y:0, z:-0.18}}, dragmode:'turntable', bgcolor:'#f7f9fb'};
  Plotly.react('a3Site', tr, {margin:{l:0,r:0,t:0,b:0}, height:560, font:a3font, showlegend:false, uirevision:geoOn ? 'site-geo-' + (gv && gsx > 600 ? GEO.size : 'site') : 'site', paper_bgcolor:'#fff', scene:sc},
    {responsive:true, displaylogo:false, scrollZoom:false});
  const el = document.getElementById('a3Site');
  if (!el._a3click){ el._a3click = true; el.on('plotly_click', ev => { const cn = ev.points[0].curveNumber, k = (el._zoneIdx || []).indexOf(cn); if (k >= 0){ A3.zone = k; drawSite(); } }); }
  el._zoneIdx = zoneIdx;
  const inf = document.getElementById('a3SiteInfo');
  if (!inf._geo){ inf._geo = true; inf.addEventListener('click', ev => {
    if (ev.target.id === 'a3Geo'){ A3.geo = A3.geo === false; if (A3.geo && GEO.st === 'err'){ GEO.st = 'idle'; } drawSite(); }
    if (ev.target.id === 'a3Kml') siteKml();
    const sz = ev.target.dataset && ev.target.dataset.size, ex = ev.target.dataset && ev.target.dataset.ex;
    if (sz){ GEO.size = sz; if (GEO.o[sz] && GEO.o[sz].st === 'err') delete GEO.o[sz]; drawSite(); }
    if (ex){ GEO.ex = +ex; drawSite(); } }); }
  // panneau d'information
  const r = now.r, v = r.v, tot = v.prodAc + v.prodRue;
  let zi = '<p class="cap">Cliquez sur une zone de panneaux pour voir son détail.</p>';
  if (A3.zone !== null){
    const z = SITE_Z[A3.zone], role = z.role[vi], share = role === 'ru' ? z.kwc[vi]/Math.max(v.acKwc,1e-9) : role === 'rue' ? z.kwc[vi]/Math.max(v.rueKwc,1e-9) : 0;
    const pz = role === 'ru' ? now.P*share : role === 'rue' ? now.Prue*share : 0;
    zi = `<div class="zinfo" style="border-left:4px solid ${ROLE[role].c}"><b>${z.id}</b> · ${ROLE[role].t}<br>${role === 'off' ? 'Zone sans panneaux dans cette variante.' : `${fN(vi === 2 && z.note3 ? 1440 : z.mod)} modules · ${fN(vi === 2 && z.note3 ? 2939.3 : z.m2,1)} m² · <b>${fN(z.kwc[vi],1)} kWc</b> · ${z.ori}<br>Production à cet instant : <b>${fN(pz)} kW</b> (≈ ${fN(share*100,1)} % de la partie ${role === 'ru' ? 'autoconsommation' : 'injection totale'})`}</div>`;
  }
  document.getElementById('a3SiteInfo').innerHTML = `<div class="reallinks"><button class="btn sm" id="a3Geo">${A3.geo === false ? 'Afficher la photo aérienne et le relief' : 'Afficher le fond schématique'}</button>${geoOn ? `<span class="seg" id="a3Size">${Object.entries(GEO_SIZES).map(([k, o]) => `<button class="${GEO.size === k ? 'on' : ''}" data-size="${k}">${o.t}</button>`).join('')}</span><span class="seg" id="a3Ex">${[1, 2, 3].map(e => `<button class="${GEO.ex === e ? 'on' : ''}" data-ex="${e}">Relief ×${e}</button>`).join('')}</span>` : ''}<button class="btn sm" id="a3Kml">Télécharger les panneaux pour Google Earth (.kml)</button><a class="btn sm" target="_blank" rel="noopener" href="https://map.geo.admin.ch/#/map?lang=fr&3d&swisssearch=Chemin%20du%20Devin%203%201510%20Moudon">Voir le site réel en 3D (swisstopo)</a><a class="btn sm" target="_blank" rel="noopener" href="https://earth.google.com/web/search/Chemin+du+Devin+3,+1510+Moudon,+Suisse">Ouvrir dans Google Earth</a></div>${GEO.msg && A3.geo !== false ? `<p class="cap">${GEO.msg}</p>` : ''}${geoOn ? `<p class="cap">Fond : photo aérienne SWISSIMAGE et relief swissALTI3D (© swisstopo), ${GEO.d.nN} bâtiments voisins en volume dans les 500 m autour de l'usine (emprises VECTOR25, hauteurs estimées)${GEO.size !== 'site' ? ' ; au-delà, relief et photo seulement' : ''}${GEO.ex > 1 ? ` ; relief exagéré ×${GEO.ex} pour la lecture (bâtiments à l'échelle réelle)` : ''}. Zones de panneaux reportées depuis les photomontages.</p>` : ''}<div class="kpirow" style="grid-template-columns:repeat(4,1fr);margin:0 0 8px">
      <div class="kpi"><b>${fN(now.P + now.Prue)} kW</b><span>Production totale${v.rueKwc > 0 ? ` (dont RUE ${fN(now.Prue)} kW)` : ''}</span></div>
      <div class="kpi"><b>${fN(now.L)} kW</b><span>Consommation de l'usine</span></div>
      <div class="kpi"><b>${sun.el > 0 ? fN(sun.el,0)+'°' : 'nuit'}</b><span>Hauteur du soleil${sun.el > 0 ? ` · azimut ${fN(sun.az,0)}°` : ''}</span></div>
      <div class="kpi"><b>${fN(tot/1000,0)} MWh/an</b><span>${fN(v.acKwc + v.rueKwc,1)} kWc au total</span></div></div>${zi}`;
}
// ---- 3) Flux d'énergie animé ----
function drawFlow(){
  const n = a3Now(), r = n.r, v = r.v, el = document.getElementById('a3Flow');
  document.getElementById('a3Time').textContent = a3TimeTxt();
  const W = 900, Hh = 450, N = {sun:[140,85], rue:[470,60], usine:[760,225], bat:[140,365], grid:[470,385]};
  const gridUse = Math.max(n.imp - n.gridBat, 0), batOut = n.batPeak + n.batAc;
  const links = [
    ['sun','usine', n.direct, '#eda100', 'Solaire → usine'], ['sun','bat', n.sunBat, '#1baf7a', 'Solaire → batterie'], ['sun','grid', n.exp, '#eda100', 'Surplus revendu'],
    ['rue','grid', n.Prue, '#1baf7a', 'Injection totale (RUE)'], ['grid','usine', gridUse, '#8c8b86', 'Réseau → usine'], ['grid','bat', n.gridBat, '#8c8b86', 'Réseau → batterie'],
    ['bat','usine', batOut, n.batPeak > 0 ? '#c0392b' : '#2a78d6', n.batPeak > 0 ? 'Batterie → usine (coupe la pointe)' : 'Batterie → usine']];
  const maxF = Math.max(800, ...links.map(l => l[2]));
  const path = (a, b, bend) => { const [x1,y1] = N[a], [x2,y2] = N[b], mx = (x1+x2)/2, my = (y1+y2)/2 + bend; return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`; };
  const bends = {'sun-usine':-40, 'sun-bat':0, 'sun-grid':40, 'rue-grid':0, 'grid-usine':30, 'grid-bat':20, 'bat-usine':60};
  let svg = `<svg viewBox="0 0 ${W} ${Hh}" class="flowsvg">`;
  links.forEach(([a,b,f,c,t]) => {
    if (a === 'rue' && v.rueKwc <= 0) return;
    const on = f > 0.5, w = on ? 3 + 34*Math.sqrt(f/maxF) : 1.5, dur = on ? Math.max(0.35, 2.4 - 2*Math.sqrt(f/maxF)) : 0, d = path(a, b, bends[a+'-'+b]);
    svg += `<path d="${d}" fill="none" stroke="${on ? c : '#e3e2dc'}" stroke-opacity="${on ? 0.28 : 1}" stroke-width="${w}" stroke-linecap="round"/>`;
    if (on) svg += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${Math.max(2, w*0.42)}" stroke-linecap="round" stroke-dasharray="2 ${Math.max(10, w)}" class="flowdash" style="animation-duration:${dur}s"><title>${t} : ${fN(f)} kW</title></path>`;
    if (on){ const [x1,y1] = N[a], [x2,y2] = N[b], mx = (x1+x2)/2, my = (y1+y2)/2 + bends[a+'-'+b]/2; svg += `<text x="${mx}" y="${my - 8}" class="flowlbl">${fN(f)} kW</text>`; }
  });
  const node = (k, title, sub, col, extra='') => { const [x,y] = N[k]; return `<g><circle cx="${x}" cy="${y}" r="50" fill="#fff" stroke="${col}" stroke-width="3"/>${extra}<text x="${x}" y="${y-4}" class="flownode">${title}</text><text x="${x}" y="${y+14}" class="flowsub">${sub}</text></g>`; };
  const socPct = n.cap ? n.soc/n.cap : 0;
  svg += node('sun', 'Solaire', `${fN(n.P)} kW`, '#eda100');
  if (v.rueKwc > 0) svg += node('rue', 'RUE', `${fN(n.Prue)} kW`, '#1baf7a');
  svg += node('usine', 'Usine', `${fN(n.L)} kW`, '#1a1a19');
  svg += r.hasBat ? node('bat', 'Batterie', `${fN(socPct*100)} %`, '#2a78d6', `<rect x="${N.bat[0]-30}" y="${N.bat[1]+24}" width="60" height="7" rx="3" fill="#e3e2dc"/><rect x="${N.bat[0]-30}" y="${N.bat[1]+24}" width="${60*socPct}" height="7" rx="3" fill="#2a78d6"/>`) : node('bat', 'Batterie', 'aucune', '#c9c7c0');
  svg += node('grid', 'Réseau', n.imp > 0.5 ? `achat ${fN(n.imp)} kW` : `vente ${fN(n.exp + n.Prue)} kW`, '#8c8b86');
  svg += '</svg>';
  el.innerHTML = svg;
  const peakTxt = n.thr ? (n.batPeak > 0 ? `<b style="color:#c0392b">La batterie coupe une pointe</b> : sans elle, l'usine tirerait ${fN(n.imp + n.batPeak)} kW ; le réseau ne fournit que ${fN(n.imp)} kW (seuil du mois ${fN(n.thr)} kW).` : `Soutirage ${fN(n.imp)} kW, seuil de pointe du mois ${fN(n.thr)} kW${n.imp > n.thr ? ' : la pointe passe (batterie vide ou trop faible).' : ' : pas de pointe à couper.'}`) : (r.hasBat ? 'Peak shaving désactivé.' : 'Pas de batterie dans cette variante.');
  document.getElementById('a3FlowTxt').innerHTML = `${v.name} · ${a3TimeTxt()}. ${peakTxt}`;
}
let a3Timer = null;
function a3Step(dq){ A3.qh += dq; if (A3.qh > 95){ A3.qh = 0; a3Day(1); } if (A3.qh < 0){ A3.qh = 95; a3Day(-1); } document.getElementById('a3Qh').value = A3.qh; drawFlow(); if (window.Plotly) drawSite(); }
function a3Day(dd){ const d = new Date(A3.day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dd); const iso = d.toISOString().slice(0,10); if (iso >= '2025-10-01' && iso <= '2026-09-30') A3.day = iso; document.getElementById('a3Day').value = A3.day; }
document.getElementById('a3Day').onchange = e => { A3.day = e.target.value || A3.day; drawFlow(); if (window.Plotly) drawSite(); };
document.getElementById('a3Qh').oninput = e => { A3.qh = +e.target.value; drawFlow(); if (window.Plotly) drawSite(); };
document.getElementById('a3Play').onclick = () => {
  A3.play = !A3.play; document.getElementById('a3Play').textContent = A3.play ? '❚❚ Pause' : '▶ Lecture';
  clearInterval(a3Timer); if (A3.play) a3Timer = setInterval(() => { if (!document.getElementById('tab-a3').classList.contains('active')){ A3.play = false; clearInterval(a3Timer); document.getElementById('a3Play').textContent = '▶ Lecture'; return; } a3Step(1); }, +document.getElementById('a3Speed').value);
};
document.getElementById('a3Speed').onchange = () => { if (A3.play){ document.getElementById('a3Play').click(); document.getElementById('a3Play').click(); } };
document.getElementById('a3Prev').onclick = () => a3Step(-4);
document.getElementById('a3Next').onclick = () => a3Step(4);

/* ---------------- Navigation ---------------- */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===b));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  render();
});
document.getElementById('detDate').onchange = () => renderDetail();
document.getElementById('reset').onclick = () => { CO = [{},{},{}]; saveCO(); V = JSON.parse(JSON.stringify(DEF_VAR)); G = JSON.parse(JSON.stringify(DEF_GLOB)); tuneCache.clear(); BASE = null; save(); renderParams(); renderScen(); renderPilot(); schedule(); };
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

  let h = `<div class="rhead"><img src="logo-model.png" alt="Model"><div><h1>Installation photovoltaïque, Moudon</h1><div class="meta">${expert?'Rapport détaillé':'Synthèse'} · comparaison des variantes V1, V2 et V3 · ${today}</div><div class="meta">Pilotage de la batterie : ${PILOT[pilot()].t} – ${PILOT[pilot()].d} Scénario : ${scen().t} – ${scen().d}</div></div><img class="rsolimg" src="logo-soleol.png" alt="Soleol"></div>`;
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
      ${row('Seuil de pointe / réserve', r=>r.hasBat&&r.mode===0?seuilTxt(r)+' / hiver '+fN(r.R*r.cap)+' kWh, été '+fN(r.Rs*r.cap)+' kWh':'–')}
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
    if (pay === null && debtStart > 0 && debt <= 1e-6) pay = n - 1 + (avail > 0 ? remb/avail : 1); // même calcul que les cartes
    out.pay = pay;
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
   <div class="xliq">Liquidités cumulées avec subvention unique,<br>investissement ENTIÈREMENT payé${fl.pay != null ? ` (après ${fN(fl.pay,1)} ans)` : ''}</div>
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
    row('Investissement entièrement payé après', (r,i)=> F[i].pay != null ? fN(F[i].pay,1)+' ans' : '> 30 ans', 1) +
    row('Liquidités cumulées à 20 / 25 / 30 ans (CHF)', (r,i)=>[19,24,29].map(k=>fCHF(F[i][k].cum)).join(' / '), 1) + '</tbody>';
  segs('actSel', actIdx, i => { actIdx = i; renderAct(); });
  togs('actTog', actIdx);
  renderXl();
}
function togs(id, i, lines){
  const v = V[i], el = document.getElementById(id);
  el.innerHTML = (lines ? `<label class="sw" title="Ligne « réduction de la puissance de pointe » dans les recettes"><input type="checkbox" data-k="fipPuiss" ${v.fipPuiss!==false?'checked':''}><span class="k"></span>Ligne puissance de pointe</label>
     <label class="sw" title="Ligne « énergie réactive » dans les recettes (coût dû à la franchise réduite)"><input type="checkbox" data-k="fipQ" ${v.fipQ!==false?'checked':''}><span class="k"></span>Ligne énergie réactive</label>` : '') + `<label class="sw"><input type="checkbox" data-k="batOn" ${v.batOn?'checked':''}><span class="k"></span>Batterie</label>
     <label class="sw"><input type="checkbox" data-k="psOn" ${v.psOn?'checked':''} ${v.batOn?'':'disabled'}><span class="k"></span>Peak shaving</label>
     <label class="sw" title="La batterie peut se recharger sur le réseau jusqu'à sa réserve (sinon uniquement avec le surplus solaire)"><input type="checkbox" data-k="gridChg" ${(v.gridChg ?? G.gridChg)?'checked':''} ${v.batOn?'':'disabled'}><span class="k"></span>Recharge réseau</label>`;
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
  let h = `<div class="rhead"><img src="logo-model.png" alt="Model"><div><h1>Installation photovoltaïque, Moudon</h1><div class="meta">Dossier actionnaire${only!==null?' · '+RES[only].v.name:''} · ${today} · document interne</div><div class="meta">Pilotage de la batterie : ${PILOT[pilot()].t} – ${PILOT[pilot()].d} Scénario : ${scen().t} – ${scen().d}</div></div><img class="rsolimg" src="logo-soleol.png" alt="Soleol"></div>
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
function renderPilot(){ const el = document.getElementById('psPilot'); if (!el) return;
  el.innerHTML = Object.entries(PILOT).map(([k,o]) => `<button data-p="${k}" class="${pilot()===k?'on':''}" title="${o.d.replace(/"/g,'&quot;')}">${o.t}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { G.pilot = b.dataset.p; save(); renderPilot(); renderParams(); schedule(); }); }
renderPilot();
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
  tuneCache.clear(); BASE = null; save(); renderParams(); renderScen(); renderPilot(); schedule(); };

bindTips(document);
renderParams();
render();
