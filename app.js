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
   batOn:true, psOn:true, batKwh:500, batKw:125, batReduc:99336, acPrice:0.097, T:730, R:0.8},
  {name:'V2 · Tout en autoconsommation', acKwc:4200.77, prodAc:4576824, rueKwc:0, prodRue:0, price:3276600,
   batOn:true, psOn:true, batKwh:1000, batKw:500, batReduc:199024, acPrice:0.097, T:640, R:1},
  {name:'V3 · RU, moins de panneaux', acKwc:2912.07, prodAc:3114100, rueKwc:0, prodRue:0, price:2169500,
   batOn:true, psOn:true, batKwh:1000, batKw:500, batReduc:220222, acPrice:0.097, T:650, R:1},
];
const DEF_GLOB = {rev:0.0741, puiss:9.47, prixQ:0.0282, rueOn:true, rueRate:520, ru1:360, ru2:300, ru3:250,
  deg:0.0035, assur:0.003, maint:0.002, hyp:0.02, actu:0.02, fp:0, horizon:25, subYear:1,
  usable:0.88, eta:0.938, auto:true};

const VAR_FIELDS = [
  ['sec','Installation'],
  ['acKwc','Puissance en autoconsommation (kWc)',2,'Panneaux raccordés derrière le compteur de l\'usine : ils alimentent d\'abord l\'usine, le surplus est revendu. Subvention RU.'],
  ['prodAc','Production de la partie autoconsommation (kWh/an)',0,'Production 1re année selon la simulation PVsyst de la variante (fichier de flux).'],
  ['rueKwc','Puissance en injection totale (kWc)',2,'Installation séparée, avec son propre compteur : toute la production est revendue, rien ne va à l\'usine. Subvention RUE.'],
  ['prodRue','Production de la partie injection totale (kWh/an)',0,'Production 1re année de l\'installation en injection totale (fichier de flux V1).'],
  ['price','Prix de l\'offre TTC (CHF)',0,'Prix clé en main à mettre dans l\'offre, batterie comprise (fichier vert).'],
  ['acPrice','Valeur du kWh autoconsommé (CHF/kWh)',4,'Prix évité pour chaque kWh qui n\'est plus acheté au réseau (fichiers de flux : 9.7 ct).'],
  ['sec','Batterie'],
  ['batKwh','Capacité (kWh)',0,'Capacité nominale. V1 : 500 kWh ; V2 et V3 : Pylontech A1000-OMNI 1 MWh.'],
  ['batKw','Puissance de charge et décharge (kW)',0,'Puissance maximale que la batterie peut fournir ou absorber. V1 : 125 kW ; Pylontech : 500 kW.'],
  ['batReduc','Baisse du prix si pas de batterie (CHF TTC)',0,'Montant retiré du prix de l\'offre quand la batterie est désactivée : coût de la batterie du fichier vert avec la même marge que l\'offre (V3 : génie civil de la batterie compris).'],
  ['T','Seuil de pointe visé (kW)',0,'Au-dessus de ce soutirage, la batterie se décharge pour écrêter la pointe. Si une pointe plus haute passe quand même, le seuil remonte jusqu\'à la fin du mois. Utilisé si le réglage automatique est désactivé.'],
  ['R','Réserve pour les pointes (0 à 1)',2,'Part de la capacité gardée en semaine pour le peak shaving. 1 = la batterie ne sert qu\'aux pointes en semaine. Le week-end la réserve est libérée pour stocker le surplus. Utilisé si le réglage automatique est désactivé.'],
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
  ['auto','Réglage automatique du pilotage',-1,'Cherche le seuil de pointe et la réserve les plus rentables, réglés sur janv.–sept. 2025 puis appliqués à l\'année simulée.'],
];

let V = JSON.parse(JSON.stringify(DEF_VAR));
let G = JSON.parse(JSON.stringify(DEF_GLOB));
try { const s = JSON.parse(localStorage.getItem('moudon_state')); if (s && s.V && s.G) { V = s.V; G = Object.assign({}, DEF_GLOB, s.G); } } catch (e) {}
function save(){ try { localStorage.setItem('moudon_state', JSON.stringify({V, G})); } catch (e) {} }

/* ---------------- Préparation des séries ---------------- */
function series(start, n, load, pv, testYear){
  const t0 = Date.UTC(+start.slice(0,4), +start.slice(5,7)-1, +start.slice(8,10));
  const m = new Uint8Array(n), wk = new Uint8Array(n);
  for (let i = 0; i < n; i++){
    const d = new Date(t0 + i*900000), h = d.getUTCHours() + d.getUTCMinutes()/60, w = d.getUTCDay();
    m[i] = testYear ? (d.getUTCFullYear()-2025)*12 + d.getUTCMonth() - 9 : d.getUTCMonth();
    wk[i] = ((w === 5 && h >= 22) || w === 6 || (w === 0 && h < 20)) ? 1 : 0;
  }
  return {n, t0, load: Float64Array.from(load), pv: Float64Array.from(pv, x => x/1e7), m, wk, nm: testYear ? 12 : 9};
}
const YEAR = series(D.start, D.n, D.load, D.pv, true);
const CAL = series(D.calStart, D.calN, D.calLoad, D.calPv, false);

/* ---------------- Simulation quart d'heure ---------------- */
function sim(S, prod, cap, pw, T0, R, eta, mode, keep){
  // mode 0 : peak shaving + autoconsommation ; mode 1 : autoconsommation seule
  const n = S.n, nm = S.nm;
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
      const res = (S.wk[i] || mode) ? 0 : R*cap;
      if (x < 0){ c = Math.min(-x, pw, (cap-soc)/(eta*DT)); kind = 1; }
      else if (x > T){ d = Math.min(x-T, pw, soc*eta/DT); kind = 3; }
      else if (soc > res){ d = Math.min(x, pw, (soc-res)*eta/DT); kind = 4; }
      else if (soc < res && x < T-100){ c = Math.min(T-50-x, pw, (res-soc)/(eta*DT)); gchg += c*DT; kind = 2; }
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
  const key = [prodPerKwh, cap, pw, ac, G.puiss, G.rev, G.prixQ, G.eta].join('|');
  if (tuneCache.has(key)) return tuneCache.get(key);
  let best = null;
  for (let T = 520; T <= 960; T += 10) for (const R of [0.2,0.4,0.6,0.8,1]){
    const c = annualCost(sim(CAL, prodPerKwh, cap, pw, T, R, G.eta, 0, false), ac, Q_CAL);
    if (!best || c < best.c) best = {c, T, R};
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
  let T = v.T, R = v.R;
  const mode = (hasBat && v.psOn) ? 0 : 1;
  if (hasBat && v.psOn && G.auto){ const t = tune(v.prodAc, cap, pw, v.acPrice); T = t.T; R = t.R; }
  const r = sim(YEAR, v.prodAc, cap, pw, T, R, G.eta, mode, true);
  const r0 = hasBat ? sim(YEAR, v.prodAc, 0, 0, 1e9, 1, G.eta, 1, false) : r;
  const sum = a => a.reduce((s,x)=>s+x, 0);
  const impB = sum(BASE.imp), imp = sum(r.imp);
  const qB = Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*BASE.imp[k],0),0), qV = Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*r.imp[k],0),0);
  const sEnergy = (impB - imp)*v.acPrice;
  const sPeak = (sum(BASE.peak) - sum(r.peak))*G.puiss;
  const sQ = -(qV - qB)*G.prixQ;
  const sExp = r.exp*G.rev;
  const sRue = v.prodRue*G.rev;
  const batPart = hasBat ? (sum(r0.peak) - sum(r.peak))*G.puiss + (sum(r0.imp)-imp)*v.acPrice + (r.exp-r0.exp)*G.rev
                   - (qV - Q_KVARH.reduce((s,q,k)=>s+Math.max(q-0.5*r0.imp[k],0),0))*G.prixQ : 0;
  const price = v.price - (v.batOn ? 0 : v.batReduc);
  const sub = ruAmount(v.acKwc) + (v.rueKwc > 0 ? (G.rueOn ? G.rueRate*v.rueKwc : ruAmount(v.rueKwc)) : 0);
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
  return {v, hasBat, mode, T, R, r, price, sub, net, dep, sEnergy, sPeak, sQ, sExp, sRue, batPart,
    year1: sEnergy + sPeak + sQ + sExp + sRue, autoconso: v.prodAc - r.exp,
    tauxAc: v.prodAc > 0 ? (v.prodAc - r.exp)/v.prodAc : 0, tauxAc0: v.prodAc > 0 ? (v.prodAc - r0.exp)/v.prodAc : 0,
    couverture: (v.prodAc - r.exp)/(sum(BASE.imp)), tauxTot: (v.prodAc + v.prodRue) > 0 ? (v.prodAc - r.exp)/(v.prodAc + v.prodRue) : 0, surplus: r.exp, rueProd: v.prodRue,
    peakAvg: sum(r.peak)/12, peakMonths: Array.from(r.peak), impMonths: Array.from(r.imp), rows, npv, cum, payback, simple, cycles: cap ? r.dis/cap : 0};
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
  renderCards(); renderComp(); renderFlux(); renderPS(); renderDetail();
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
     ${r.hasBat && r.mode===0 ? `<div class="cap">Pilotage : seuil ${fN(r.T)} kW, réserve ${fN(r.R*100)} %${G.auto?' (réglage automatique)':''}</div>` : ''}
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

function renderDetail(){
  segs('detSel', detIdx, i => { detIdx = i; renderDetail(); });
  const r = RES[detIdx], S = YEAR;
  const dv = document.getElementById('detDate').value || '2026-06-08';
  let i0 = Math.round((Date.UTC(+dv.slice(0,4), +dv.slice(5,7)-1, +dv.slice(8,10)) - S.t0)/900000);
  i0 = Math.max(0, Math.min(S.n - 672, i0));
  const lab = [], ld = [], pv = [], gr = [], so = [];
  const days = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  for (let i = i0; i < i0 + 672; i++){
    const d = new Date(S.t0 + i*900000);
    lab.push(`${days[d.getUTCDay()]} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`);
    ld.push(S.load[i]); pv.push(r.v.prodAc*S.pv[i]); gr.push(r.r.grid[i]); so.push(r.r.soc[i]);
  }
  const xax = {grid:{display:false}, ticks:{autoSkip:false, maxRotation:0, callback:(v,i)=> i%96===0 ? lab[i].slice(0,4) : ''}};
  chart('chWeek', {type:'line', data:{labels:lab, datasets:[
      {label:'Consommation', data:ld, borderColor:GREY, borderWidth:1.5, pointRadius:0},
      {label:'Production PV (autoconso)', data:pv, borderColor:'#eda100', borderWidth:1.8, pointRadius:0},
      {label:'Réseau (+ soutiré / − revendu)', data:gr, borderColor:COLORS[detIdx], borderWidth:1.5, pointRadius:0}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fN(c.parsed.y)} kW`}}}, scales:{x:xax, y:{...gridY, title:{display:true,text:'kW'}}}}});
  chart('chSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:1.5, pointRadius:0}]},
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
  const lab = [], ld = [], pv = [], net = [], gr = [], thr = [], cS = [], cG = [], dP = [], dA = [], so = [];
  let E = {load:0, pv:0, direct:0, pvBat:0, pvSold:0, gridBat:0, batPeak:0, batAc:0, imp:0, maxNet:0, maxImp:0, hours:0};
  const hasBat = r.hasBat;
  for (let i = i0; i < i1; i++){
    const d = new Date(S.t0 + i*900000);
    const hh = String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
    lab.push(psMode === 'day' ? hh : `${days[d.getUTCDay()]} ${d.getUTCDate()} ${hh}`);
    const L = S.load[i], P = r.v.prodAc*S.pv[i], x = L - P, y = sim_.grid[i];
    const c = sim_.ch[i], dd = sim_.dis15[i], k = sim_.kind[i];
    ld.push(L); pv.push(P); net.push(Math.max(x,0)); gr.push(Math.max(y,0)); thr.push(hasBat && r.mode===0 && isFinite(sim_.thr[i]) ? sim_.thr[i] : null);
    cS.push(k===1 ? c : 0); cG.push(k===2 ? c : 0); dP.push(k===3 ? -dd : 0); dA.push(k===4 ? -dd : 0); so.push(sim_.soc[i]);
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
  chart('psSoc', {type:'line', data:{labels:lab, datasets:[{label:'État de charge', data:so, borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,.12)', fill:true, borderWidth:1.5, pointRadius:0}]},
    options:{animation:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`${fN(c.parsed.y)} kWh`}}}, scales:{x:xax, y:{...gridY, beginAtZero:true, title:{display:true,text:'kWh'}}}}});
  const hb = (id, parts, total) => chart(id, {type:'bar', data:{labels:[''], datasets: parts.map(p=>({label:`${p[0]} : ${fN(p[1]/1000,1)} MWh (${total?fN(p[1]/total*100):0} %)`, data:[p[1]/1000], backgroundColor:p[2]}))},
    options:{indexAxis:'y', animation:false, plugins:{legend:{position:'bottom', labels:{boxWidth:12}}, tooltip:{callbacks:{label:c=>c.dataset.label}}}, scales:{x:{stacked:true, ...gridY, title:{display:true,text:'MWh'}}, y:{stacked:true, grid:{display:false}}}}});
  document.getElementById('psRate').textContent = `Taux d'autoconsommation sur la période : ${E.pv ? fN((E.pv - E.pvSold)/E.pv*100,1) : 0} % · consommation couverte par le solaire : ${E.load ? fN((E.direct + E.pvBat*G.eta*G.eta)/E.load*100,1) : 0} %.`;
  hb('psUse', [['Utilisée directement', E.direct, '#2a78d6'], ['Stockée dans la batterie', E.pvBat, '#1baf7a'], ['Revendue', E.pvSold, '#eda100']], E.pv);
  hb('psSrc', [['Solaire direct', E.direct, '#eda100'], ['Batterie (pointes)', E.batPeak, '#c0392b'], ['Batterie (autoconso)', E.batAc, '#1baf7a'], ['Réseau', E.load - E.direct - E.batPeak - E.batAc, '#8c8b86']], E.load);
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

/* ---------------- Navigation ---------------- */
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active', x===b));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  render();
});
document.getElementById('detDate').onchange = () => renderDetail();
document.getElementById('reset').onclick = () => { V = JSON.parse(JSON.stringify(DEF_VAR)); G = JSON.parse(JSON.stringify(DEF_GLOB)); tuneCache.clear(); BASE = null; save(); renderParams(); schedule(); };
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

  let h = `<div class="rhead"><img src="logo-model.png" alt="Model"><div><h1>Installation photovoltaïque, Moudon</h1><div class="meta">${expert?'Rapport détaillé':'Synthèse'} · comparaison des variantes V1, V2 et V3 · ${today}</div></div><div class="rsol"><span>SOLEOL</span><small>ENERGIE</small></div></div>`;
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
    <li><b>Batterie</b> : en semaine, elle garde une réserve pour écrêter les pointes ; le week-end, elle stocke le surplus solaire.</li>
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
      ${row('Seuil de pointe / réserve', r=>r.hasBat&&r.mode===0?fN(r.T)+' kW / '+fN(r.R*100)+' %':'–')}
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
      <li>Batterie : à chaque quart d'heure, le surplus solaire la charge ; au-dessus du seuil de pointe elle se décharge ; la réserve est gardée en semaine et libérée le week-end. ${G.auto?'Seuil et réserve réglés sur janvier à septembre 2025, puis appliqués à l\'année simulée.':'Seuil et réserve fixés manuellement.'}</li>
      <li>Tarif de puissance et énergie réactive : factures Romande Energie. Prix des offres et des batteries : fichier de prix (TTC).</li>
      <li>Non compris : remplacement d'onduleurs ou de batterie, évolution des tarifs, frais de raccordement. Une seule année de consommation, reproduite sur toute la durée.</li></ul>`;
  }
  h += `<p class="note" style="margin-top:14px">Résultats calculés avec les paramètres saisis dans le simulateur le ${today}. Document indicatif, ne constitue pas une offre ferme.</p>`;
  const el = document.getElementById('report'); el.innerHTML = h;
  const imgs = [...el.querySelectorAll('img')];
  Promise.all(imgs.map(i => i.complete ? 0 : new Promise(res => { i.onload = i.onerror = res; }))).then(() => setTimeout(() => window.print(), 100));
}
document.getElementById('repClient').onclick = () => report(false);
document.getElementById('repExpert').onclick = () => report(true);

bindTips(document);
renderParams();
render();
