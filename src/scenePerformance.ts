import {useCallback,useLayoutEffect,useRef} from 'react';
import {addAfterEffect,useFrame,useThree} from '@react-three/fiber';

type Sample={
 frames:number;intervals:number;elapsed:number;lastAt:number|null;
 windowMs:number;windowIntervals:number;slowWindows:number;
 peakDrawCalls:number;drawCalls:number;triangles:number;geometries:number;
};
type Status='measuring'|'complete'|'interrupted';

function publish(canvas:HTMLCanvasElement,sample:Sample,status:Status,quantity:number) {
 const data=canvas.dataset;
 data.cookStatus=status;
 data.cookShawarmaQuantity=String(quantity);
 data.cookFrames=String(sample.frames);
 data.cookDurationMs=String(Math.round(sample.elapsed));
 data.fps=sample.elapsed?String(Math.round(sample.intervals*1000/sample.elapsed)):'';
 data.drawCalls=String(sample.drawCalls);
 data.cookPeakDrawCalls=String(sample.peakDrawCalls);
 data.cookTriangles=String(sample.triangles);
 data.geometries=String(sample.geometries);
}

export function useCookPerformance(active:boolean,quantity:number,compact:boolean,reduceQuality:()=>void) {
 const renderer=useThree(state=>state.gl);
 const pendingFrame=useRef(false);
 const finish=useRef<()=>void>(()=>{});
 const settings=useRef({compact,reduceQuality});
 useLayoutEffect(()=>{settings.current={compact,reduceQuality}},[compact,reduceQuality]);
 useFrame(()=>{if(active)pendingFrame.current=true});

 useLayoutEffect(()=>{
  if(!active)return;
  const sample:Sample={
   frames:0,intervals:0,elapsed:0,lastAt:null,windowMs:0,windowIntervals:0,slowWindows:0,
   peakDrawCalls:0,drawCalls:0,triangles:0,geometries:renderer.info.memory.geometries,
  };
  let finished=false;
  let qualityReduced=false;
  const canvas=renderer.domElement;
  const end=(status:Status)=>{
   if(finished)return;
   finished=true;
   publish(canvas,sample,status,quantity);
  };
  finish.current=()=>end(renderer.getContext().isContextLost()?'interrupted':'complete');
  publish(canvas,sample,'measuring',quantity);

  const visibility=()=>{
   // A background pause is outside the cooking frame budget.
   sample.lastAt=null;
   sample.windowMs=0;
   sample.windowIntervals=0;
   sample.slowWindows=0;
   pendingFrame.current=false;
  };
  document.addEventListener('visibilitychange',visibility);
  let compactMode=settings.current.compact;
  const unsubscribe=addAfterEffect(timestamp=>{
   if(!pendingFrame.current)return;
   pendingFrame.current=false;
   if(finished||document.hidden||renderer.getContext().isContextLost())return;
   const mode=settings.current.compact;
   if(mode!==compactMode){
    compactMode=mode;
    sample.windowMs=0;
    sample.windowIntervals=0;
    sample.slowWindows=0;
   }
   sample.frames++;
   sample.drawCalls=renderer.info.render.calls;
   sample.peakDrawCalls=Math.max(sample.drawCalls,sample.peakDrawCalls);
   sample.triangles=renderer.info.render.triangles;
   sample.geometries=renderer.info.memory.geometries;
   const previous=sample.lastAt;
   sample.lastAt=timestamp;
   if(previous===null||timestamp<=previous)return;
   const interval=timestamp-previous;
   sample.intervals++;
   sample.elapsed+=interval;
   sample.windowIntervals++;
   sample.windowMs+=interval;
   if(sample.windowMs<1000)return;
   const windowFps=sample.windowIntervals*1000/sample.windowMs;
   // Mobile intentionally targets about 30 fps. Wait for two slow active windows before reducing quality.
   const threshold=mode?23:42;
   sample.slowWindows=windowFps<threshold?sample.slowWindows+1:0;
   if(!qualityReduced&&sample.slowWindows>=2){
    qualityReduced=true;
    settings.current.reduceQuality();
   }
   sample.windowMs=0;
   sample.windowIntervals=0;
   publish(canvas,sample,'measuring',quantity);
  });
  return()=>{
   unsubscribe();
   document.removeEventListener('visibilitychange',visibility);
   pendingFrame.current=false;
   finish.current=()=>{};
   end('interrupted');
  };
 },[active,quantity,renderer]);

 return useCallback(()=>finish.current(),[]);
}
