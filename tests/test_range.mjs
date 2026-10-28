import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../web/range.js', import.meta.url),'utf8').replaceAll('export function','function');
const context={};vm.runInNewContext(source,context);
const r=context.range(10,5,9,48000);assert.equal(r.start,5);assert.equal(r.end,10);
assert.equal(context.range(3,5,0),null);
assert.equal(context.range(10,.25,.25,10).start,.2); // Python tie behavior
const node={inputs:[{name:'duration',link:1}],graph:{links:{1:{origin_id:2,origin_slot:0}},getNodeById(){return {comfyClass:'H3VideoController',outputs:[{name:'actual_duration_seconds'}],widgets:[{name:'duration_seconds',value:5}]}}}};
assert.equal(context.connectedDuration(node),124/24);
node.inputs[0].link=null;assert.equal(context.connectedDuration(node),null);
console.log('PASS: frontend range clamping, short-source handling, sample rounding, linked H3 duration and disconnection');
