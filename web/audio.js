import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { range, connectedDuration } from './range.js';

function createPlayer(node) {
    const root = document.createElement('div');
    root.className = 'aman-audio-player';
    Object.assign(root.style, {display:'flex',flexDirection:'column',gap:'10px',padding:'12px',boxSizing:'border-box',width:'100%',height:'340px',color:'#fff',font:'13px sans-serif',background:'#171c24',borderRadius:'8px'});
    const buttons = document.createElement('div');
    Object.assign(buttons.style,{display:'flex',gap:'8px',flexWrap:'wrap'});
    function button(label, action) {
        const b=document.createElement('button'); b.textContent=label; b.type='button';
        Object.assign(b.style,{background:'#303846',color:'#fff',border:'1px solid #566171',borderRadius:'6px',padding:'7px 10px',cursor:'pointer'});
        b.onclick=action;buttons.append(b);return b;
    }
    const picker=document.createElement('input');picker.type='file';picker.accept='audio/*,.m4a,.flac,.aiff,.opus,.wma,.mp4,.webm';picker.style.display='none';
    const filename=document.createElement('div');filename.textContent='Choose an audio file';filename.style.overflowWrap='anywhere';
    const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.style.width='100%';
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=140;canvas.tabIndex=0;canvas.setAttribute('aria-label','Audio waveform. Drag to select; arrow keys adjust start time.');
    Object.assign(canvas.style,{width:'100%',height:'116px',background:'#10151c',borderRadius:'6px',touchAction:'none',cursor:'grab',flexShrink:'0'});
    const status=document.createElement('div');status.style.fontVariantNumeric='tabular-nums';status.style.minHeight='34px';
    root.append(buttons,picker,filename,audio,canvas,status);
    const fileWidget=()=>node.widgets?.find(w=>w.name==='audio_file');
    const startWidget=()=>node.widgets?.find(w=>w.name==='start_seconds');
    let info=null, currentFile=null, requestId=0, controller=null, disposed=false;
    let selectionOnly=false, viewStart=0, viewLength=null, dragging=false, offset=0;
    let executedDuration=null, lastState='';
    function duration(){
        const input=node.inputs?.find(i=>i.name==='duration');
        return input?.link != null ? (connectedDuration(node) ?? executedDuration) : null;
    }
    function selected(){return info ? range(info.duration,duration(),Number(startWidget()?.value || 0),info.sample_rate) : null;}
    function error(message){status.textContent=message;status.style.color='#ffb9b9';}
    function refresh(){
        const r=selected();
        if(!info)return;
        status.style.color='#d9e3ed';
        if(!duration()){status.textContent=`Full file: ${info.duration.toFixed(3)} s • Connect duration (H3 actual_duration_seconds). Other sources may need one execution for preview.`;}
        else if(!r){error(`File is ${info.duration.toFixed(3)} s; selection needs ${Number(duration()).toFixed(3)} s. Choose a longer file or reduce duration.`);}
        else {status.textContent=`Full: ${info.duration.toFixed(3)} s  |  Start: ${r.start.toFixed(3)} s  →  End: ${r.end.toFixed(3)} s  |  Selected: ${r.duration.toFixed(3)} s`;
            // Mirror backend EOF clamping in the visible manual Start field.
            if(startWidget() && Math.abs(Number(startWidget().value)-r.start)>1/info.sample_rate)startWidget().value=r.start;
        }
        draw();
    }
    function draw(){
        const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;
        ctx.clearRect(0,0,w,h);ctx.fillStyle='#10151c';ctx.fillRect(0,0,w,h);
        if(!info)return;
        const length=viewLength || info.duration;
        ctx.strokeStyle='#8eafbd';ctx.lineWidth=1;
        ctx.beginPath();
        for(let x=0;x<w;x++){
            const time=viewStart+x/w*length;
            const index=Math.min(info.peaks.length-1,Math.floor(time/info.duration*info.peaks.length));
            const amplitude=Math.min(1,info.peaks[index] || 0)*(h/2-14);
            ctx.moveTo(x,h/2-amplitude);ctx.lineTo(x,h/2+amplitude);
        }ctx.stroke();
        const r=selected();
        if(r){const left=(r.start-viewStart)/length*w,right=(r.end-viewStart)/length*w;
            ctx.fillStyle='rgba(106,190,255,.22)';ctx.fillRect(left,0,right-left,h);
            ctx.strokeStyle='#88ccff';ctx.lineWidth=3;ctx.strokeRect(left+1,2,Math.max(2,right-left-2),h-4);
        }
        ctx.fillStyle='#e1e8ef';ctx.font='15px sans-serif';ctx.fillText(`${viewStart.toFixed(2)} s`,8,h-5);
        ctx.textAlign='right';ctx.fillText(`${(viewStart+length).toFixed(2)} s`,w-8,h-5);ctx.textAlign='left';
    }
    function move(start){
        if(!info || !duration())return;
        const r=range(info.duration,duration(),start,info.sample_rate);if(!r)return;
        startWidget().value=r.start;startWidget().callback?.(r.start);
        audio.pause();selectionOnly=false;node.setDirtyCanvas?.(true,true);refresh();
    }
    function pointerTime(event){const rect=canvas.getBoundingClientRect();return viewStart+(event.clientX-rect.left)/rect.width*(viewLength || info.duration);}
    canvas.addEventListener('pointerdown',event=>{
        if(!info || !selected())return;
        event.preventDefault();event.stopPropagation();const t=pointerTime(event),r=selected();
        offset=t>=r.start && t<=r.end?t-r.start:r.duration/2;
        dragging=true;canvas.setPointerCapture(event.pointerId);move(t-offset);
    });
    canvas.addEventListener('pointermove',event=>{if(dragging){event.stopPropagation();move(pointerTime(event)-offset);}});
    canvas.addEventListener('pointerup',()=>{dragging=false;});canvas.addEventListener('pointercancel',()=>{dragging=false;});
    canvas.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();move(Number(startWidget()?.value || 0)+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:.1));}});
    async function load(){
        const file=fileWidget()?.value;if(file===currentFile)return;
        currentFile=file;const id=++requestId;controller?.abort();audio.pause();info=null;selectionOnly=false;executedDuration=null;viewStart=0;viewLength=null;
        if(!file){filename.textContent='Choose an audio file';status.textContent='No file selected.';draw();return;}
        filename.textContent=file.replace(/^aman_audio\/[a-f0-9]{32}_/,'');status.textContent='Loading complete waveform…';
        const slash=file.lastIndexOf('/');
        audio.src=api.apiURL('/view?'+new URLSearchParams({filename:file.slice(slash+1),subfolder:slash<0?'':file.slice(0,slash),type:'input'}));
        controller=new AbortController();
        try{
            const response=await api.fetchApi('/aman_audio/info?'+new URLSearchParams({file}),{signal:controller.signal});
            const data=await response.json();if(!response.ok)throw Error(data.error || 'Could not decode audio.');
            if(id!==requestId || disposed)return;info=data;refresh();
        }catch(e){if(e.name!=='AbortError' && id===requestId)error(e.message);}
    }
    const uploadButton=button('Choose Audio File',()=>picker.click());
    button('Play Selection',async()=>{
        const r=selected();if(!r){error('Connect duration and choose a file with a long enough segment.');return;}
        selectionOnly=true;audio.currentTime=r.start;
        try{await audio.play();}catch(e){error('Playback unavailable for this browser/codec. Try WAV or MP3. '+e.message);}
    });
    button('Play Full File',async()=>{selectionOnly=false;audio.currentTime=0;try{await audio.play();}catch(e){error(e.message);}});
    button('Zoom Selection',()=>{const r=selected();if(!r)return;viewLength=Math.min(info.duration,Math.max(r.duration*4,.1));viewStart=Math.max(0,Math.min(info.duration-viewLength,r.start-(viewLength-r.duration)/2));draw();});
    button('Full Waveform',()=>{viewStart=0;viewLength=null;draw();});
    picker.onchange=async()=>{
        const file=picker.files?.[0];if(!file)return;uploadButton.disabled=true;status.textContent='Uploading complete file…';
        try{
            const form=new FormData();form.append('audio',file);
            const response=await api.fetchApi('/aman_audio/upload',{method:'POST',body:form});const data=await response.json();
            if(!response.ok)throw Error(data.error || 'Upload failed.');if(disposed)return;
            const widget=fileWidget();widget.options ||= {};const choices=Array.isArray(widget.options.values)?widget.options.values:[];
            if(!choices.includes(data.file))choices.push(data.file);widget.options.values=choices;widget.value=data.file;
            startWidget().value=0;widget.callback?.(data.file);node.setDirtyCanvas?.(true,true);await load();
        }catch(e){error(e.message);}finally{uploadButton.disabled=false;picker.value='';}
    };
    audio.addEventListener('timeupdate',()=>{const r=selected();if(selectionOnly && r && audio.currentTime>=r.end){audio.pause();audio.currentTime=r.end;selectionOnly=false;}});
    audio.addEventListener('seeking',()=>{const r=selected();if(selectionOnly && r && (audio.currentTime<r.start || audio.currentTime>r.end))selectionOnly=false;});
    audio.addEventListener('error',()=>{if(currentFile)error('Browser cannot play this codec. Waveform/output may still work; use WAV or MP3 for browser playback.');});
    const timer=setInterval(()=>{
        if(disposed)return;load();const signature=[duration(),startWidget()?.value].join(':');if(signature!==lastState){lastState=signature;refresh();}
    },300);
    const widget=node.addDOMWidget('audio_player','aman_audio_player',root,{serialize:false,hideOnZoom:false});
    widget.computeSize=()=>[440,340];
    const previousExecuted=node.onExecuted;
    node.onExecuted=function(message){previousExecuted?.call(this,message);const s=message?.selection?.[0];if(s && s.file===fileWidget()?.value){executedDuration=s.duration;startWidget().value=s.start;refresh();}};
    const previousRemoved=node.onRemoved;
    node.onRemoved=function(...args){disposed=true;clearInterval(timer);controller?.abort();audio.pause();audio.removeAttribute('src');audio.load();root.remove();return previousRemoved?.apply(this,args);};
    load();return root;
}
app.registerExtension({name:'H3AudioController.Player',nodeCreated(node){if(node.comfyClass==='H3AudioController')createPlayer(node);}});
