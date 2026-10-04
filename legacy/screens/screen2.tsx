import {useEffect,useRef,useState} from 'react';
import { DesignNode } from '../ui/DesignNode';
const imgConstructing = "/assets/screen2-8170b.png";

export default function screen2() {
 const viewport=useRef<HTMLDivElement>(null);
 const [scale,setScale]=useState(1);
 useEffect(()=>{const node=viewport.current;if(!node)return;const resize=()=>setScale(Math.min(node.clientWidth/1440,node.clientHeight/1000,1));resize();const observer=new ResizeObserver(resize);observer.observe(node);return()=>observer.disconnect();},[]);
  return (
    <div className="error-viewport" ref={viewport}><div className="error-canvas" style={{transform:`translate(-50%, -50%) scale(${scale})`}}>
    <DesignNode className="d0 d4 d5" data-node-id="2210:118" data-name="404">
      <DesignNode className="d152 d39 d19 d2 d10 d50 d51 d47 d153 d154 d77 d155 d156 d64" data-node-id="2213:8">
        <p className="d43">Sahifada nosozlik yuz berdi</p>
      </DesignNode>
      <DesignNode className="d19 d157 d158 d159" data-node-id="2213:14">
        <DesignNode className="d152 d39 d19 d2 d10 d50 d51 d47 d153 d158 d77 d160 d161 d64" data-node-id="2210:276">
          <p className="d43">Xato</p>
        </DesignNode>
        <DesignNode className="d152 d39 d19 d2 d10 d50 d51 d47 d153 d162 d77 d160 d163 d64" data-node-id="2213:15">
          <p className="d43">4</p>
        </DesignNode>
        <DesignNode className="d152 d39 d19 d2 d10 d50 d51 d47 d153 d162 d77 d160 d164 d64" data-node-id="2213:16">
          <p className="d43">4</p>
        </DesignNode>
        <DesignNode className="d19 d2 d20 d47 d165 d166 d167" data-node-id="2213:12">
          <DesignNode className="d125 d99 d126">
            <DesignNode className="d4 d166" data-name="Constructing">
              <img alt="" className="d19 d26 d27 d88 d29 d5" src={imgConstructing} />
            </DesignNode>
          </DesignNode>
        </DesignNode>
      </DesignNode>
    </DesignNode>
    </div></div>
  );
}