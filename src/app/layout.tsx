import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ITISpot — Say it. Stay anonymous.',description:'Quello che non dici ad alta voce. Invia il tuo Spot anonimo, con rispetto. Ogni messaggio passa dalla moderazione.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="it"><body><a href="#main" className="skip-link">Vai al contenuto</a>{children}</body></html>;}
