// Narrow classroom transfer convention, not a manufacturer guarantee or stock list.
export const FAMILY_SOURCE='Cycle 3 LabArchives 2026_10_14_notebook_11535.pdf, B7 pp.15–16: same ligand, Pinnacle DB / Force / Raptor; Ultra changes retention.';
export function courseFamily(model){
 const f=model?.beadFamily;
 return ['Pinnacle','Force','Raptor','Ultra'].includes(f)?f:null;
}
export function courseBead(model){
 const f=courseFamily(model);
 return f?{factor:f==='Raptor'?1.5:1,basis:`Course ${f} construction convention; ${FAMILY_SOURCE}`} : null;
}
export function familyTransfer(a,b){
 const x=courseFamily(a),y=courseFamily(b),sameLigand=!!a?.ligand&&a.ligand===b?.ligand;
 const blocked=!!x&&!!y&&x!==y&&(x==='Ultra'||y==='Ultra');
 return {blocked,compatible:sameLigand&&!!x&&!!y&&!blocked&&x!=='Ultra'&&y!=='Ultra',basis:blocked?'Ultra family exchange changes retention: return to Retention / Selectivity, not N-only transfer':FAMILY_SOURCE};
}
