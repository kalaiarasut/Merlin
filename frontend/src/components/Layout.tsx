import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-ocean-50/30 dark:from-deep-950 dark:via-deep-900 dark:to-ocean-950/30 overflow-hidden">
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-grid dark:bg-grid-dark opacity-[0.02] dark:opacity-[0.05] pointer-events-none" />
      <div className="fixed inset-0 bg-mesh-gradient dark:bg-mesh-gradient-dark pointer-events-none" />
      
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-premium dark:scrollbar-premium-dark">
          <div className="p-6 lg:p-8 max-w-[1800px] mx-auto">
            <div className="animate-fade-in-up">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
