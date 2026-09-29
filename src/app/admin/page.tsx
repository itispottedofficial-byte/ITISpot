import { AdminDashboard } from '@/components/AdminDashboard';
import { Header, Footer } from '@/components/Shell';
import { mode } from '@/lib/config';
export const dynamic='force-dynamic';
export const metadata={title:'Moderazione — ITISpot'};
export default function Admin(){const demo=mode()==='demo';return <div className="site-shell admin-shell"><Header/><main id="main" className="admin-main"><AdminDashboard demo={demo}/></main><Footer demo={demo}/></div>;}
