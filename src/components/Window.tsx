import type { ReactNode } from 'react';
export function RetroWindow({title,children,className=''}:{title:string;children:ReactNode;className?:string}){
  return <section className={`retro-window ${className}`}><div className="window-title"><span>{title}</span><span className="window-controls" aria-hidden="true"><span>_</span><span>□</span><span>×</span></span></div>{children}</section>;
}
