// Pure display projection. No pressure conversion, smoothing or new readings.
export function pressureTraceFor(run){
 const p=run.measured?.pressure,z=p?.series;
 if(!z||!Array.isArray(z.t)||!Array.isArray(z.y)||z.t.length!==z.y.length||!z.t.length)return {available:false,reason:p&&Number.isFinite(p.max)?'Maximum pressure recorded, but no time-resolved pressure trace. No constant line is fabricated.':'No pressure trace recorded.',max:p?.max??null,unit:p?.unit||null};
 if(!z.t.every(Number.isFinite)||!z.y.every(Number.isFinite)||z.t.some((t,i)=>i&&t<z.t[i-1]))return {available:false,reason:'Malformed or non-chronological pressure samples; no line is drawn.'};
 const unit=typeof p.unit==='string'?p.unit.trim():null,known=!!unit&&!/^(unknown|intensity|raw|unspecified)$/i.test(unit);
 const points=z.t.map((t,i)=>[t,z.y[i]]);
 return {available:true,unit:known?unit:null,known,points,sourceCount:points.length,max:z.y.reduce((a,b)=>Math.max(a,b),-Infinity),min:z.y.reduce((a,b)=>Math.min(a,b),Infinity),basis:p.source||'Recorded time-resolved pressure readings',key:known?'pressure:'+unit:'pressure-unknown:'+run.id};
}
export function pressureGroups(runs){const map=new Map(),unavailable=[];for(const run of runs){const trace=pressureTraceFor(run);if(!trace.available){unavailable.push({run,...trace});continue;}if(!map.has(trace.key))map.set(trace.key,{key:trace.key,unit:trace.unit,known:trace.known,rows:[]});map.get(trace.key).rows.push({run,trace});}return {groups:[...map.values()],unavailable};}
export function extremaSample(points,limit=1500){
 if(points.length<=limit)return points.map(p=>[...p]);
 if(limit<4)throw Error('An extrema-preserving display needs at least four slots.');
 const buckets=Math.max(1,Math.floor((limit-2)/2)),step=Math.ceil((points.length-2)/buckets),indices=new Set([0,points.length-1]);
 for(let start=1;start<points.length-1;start+=step){let low=start,high=start;for(let i=start+1;i<Math.min(start+step,points.length-1);i++){if(points[i][1]<points[low][1])low=i;if(points[i][1]>points[high][1])high=i;}indices.add(low);indices.add(high);}
 return [...indices].sort((a,b)=>a-b).map(i=>[...points[i]]);
}
