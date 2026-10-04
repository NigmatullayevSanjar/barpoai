import {useEffect,useRef} from 'react';
import {DesignNode} from './DesignNode';
const imgEllipse='/assets/screen14-d5db7.png';
export function Notifications({close}:{close:()=>void}){const ref=useRef<HTMLElement>(null);useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();close();}};const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!(e.target as Element).closest('[aria-label="Bildirishnomalar"]'))close();};document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);if(previous?.isConnected)previous.focus();}},[close]);return <section ref={ref} id="notifications-panel" className="notifications-panel" role="dialog" aria-label="Bildirishnomalar"><header><h2>Bildirishnomalar</h2><button type="button" aria-label="Bildirishnomalarni yopish" onClick={close}>?</button></header><div className="notifications-scroll"><DesignNode className="d19 d79 d80 d81 d9 d1 d451 d2 d10 d452 d453 d3 d454 d442 d61 d241" data-node-id="2235:935" data-name="settings-pane">
        <DesignNode className="d79 d90 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:937" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:938">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:939" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:940">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:941" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:942">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:943">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:944">
              Beton yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:945">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:946" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:947">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:948" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:949" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:950">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
        <DesignNode className="d79 d90 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:982" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:983">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:984" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:985">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:986" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:987">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:988">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:989">
              Armatura yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:990">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:991" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:992">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:993" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:994" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:995">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
        <DesignNode className="d79 d90 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:996" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:997">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:998" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:999">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:1000" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:1001">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:1002">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:1003">
              Beton yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:1004">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:1005" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:1006">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:1007" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:1008" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:1009">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
        <DesignNode className="d79 d90 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:1010" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:1011">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:1012" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:1013">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:1014" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:1015">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:1016">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:1017">
              Beton yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:1018">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:1019" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:1020">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:1021" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:1022" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:1023">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
        <DesignNode className="d79 d81 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:1024" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:1025">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:1026" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:1027">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:1028" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:1029">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:1030">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:1031">
              Beton yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:1032">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:1033" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:1034">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:1035" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:1036" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:1037">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
        <DesignNode className="d79 d81 d110 d9 d1 d2 d10 d33 d455 d3 d247 d4 d15 d36" data-node-id="2235:1038" data-name="notification-card">
          <DesignNode className="d1 d2 d3 d11 d4 d15 d36" data-node-id="2235:1039">
            <DesignNode className="d79 d1 d2 d3 d48 d4 d141 d15" data-node-id="2235:1040" data-name="badge">
              <p className="d39 d50 d51 d43 d4 d15 d112 d234 d64" data-node-id="2235:1041">
                Muhim
              </p>
            </DesignNode>
            <DesignNode className="d1 d2 d20 d4 d15" data-node-id="2235:1042" data-name="Frame">
              <p className="d39 d67 d68 d43 d4 d15 d77 d69 d64" data-node-id="2235:1043">
                So’rov varqti: 28.08.2026
              </p>
            </DesignNode>
          </DesignNode>
          <DesignNode className="d39 d1 d2 d10 d3 d43 d4 d15" data-node-id="2235:1044">
            <p className="d50 d51 d183 d4 d15 d75 d65 d184 d36" data-node-id="2235:1045">
              Beton yetishmovchiligi bo’yicha
            </p>
            <p className="d67 d68 d183 d4 d15 d77 d69 d184 d36 d64" data-node-id="2235:1046">
              Katlavan qismiga beton kerak. Beton-a980 dan 20 tonna suyuq beton sorovi
            </p>
          </DesignNode>
          <DesignNode className="d81 d9 d280 d1 d2 d20 d11 d97 d4 d15 d36" data-node-id="2235:1047" data-name="Frame">
            <p className="d39 d67 d68 d43 d183 d4 d15 d77 d69 d184 d64" data-node-id="2235:1048">
              Navoiy 28 turar-joy / Blok: A
            </p>
            <DesignNode className="d1 d2 d171 d20 d4 d15" data-node-id="2235:1049" data-name="Frame">
              <DesignNode className="d4 d15 d37" data-node-id="2235:1050" data-name="Ellipse">
                <img alt="" className="d19 d38 d26 d27 d5" height="20" src={imgEllipse} width="20" />
              </DesignNode>
              <p className="d39 d41 d42 d43 d4 d15 d75 d69 d64" data-node-id="2235:1051">
                Jaloliddin S.
              </p>
            </DesignNode>
          </DesignNode>
        </DesignNode>
      </DesignNode></div></section>;}
