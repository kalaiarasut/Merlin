import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNotificationStore, Notification } from '@/store/notificationStore';
import { Bell, LogOut, Search, Moon, Sun, ChevronDown, Settings, User, HelpCircle, Monitor, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { cn } from '@/lib/utils';

// Helper to format time ago
function timeAgo(date: string): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return new Date(date).toLocaleDateString();
}

// Notification type icons/colors
const notificationStyles: Record<string, { bg: string; dot: string }> = {
  success: { bg: 'bg-marine-100 dark:bg-marine-900/30', dot: 'bg-marine-500' },
  error: { bg: 'bg-abyss-100 dark:bg-abyss-900/30', dot: 'bg-abyss-500' },
  warning: { bg: 'bg-coral-100 dark:bg-coral-900/30', dot: 'bg-coral-500' },
  info: { bg: 'bg-ocean-100 dark:bg-ocean-900/30', dot: 'bg-ocean-500' },
};

export default function Header() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme, resolvedTheme } = useThemeStore();
  const { 
    notifications, 
    unreadCount, 
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    deleteNotification 
  } = useNotificationStore();
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const navigate = useNavigate();

  // Fetch notifications on mount and periodically
  useEffect(() => {
    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification._id);
    }
    if (notification.link) {
      navigate(notification.link);
      setShowNotifications(false);
    }
  };

  return (
    <header className="bg-white/80 dark:bg-deep-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 px-6 py-3 sticky top-0 z-40">
      <div className="flex items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-deep-400 dark:text-gray-400 group-focus-within:text-ocean-500 transition-colors" />
            <input
              type="text"
              placeholder="Search species, datasets, analyses..."
              className="w-full h-11 pl-11 pr-4 rounded-xl border-2 border-gray-200/60 dark:border-gray-700 bg-gray-50/50 dark:bg-deep-800/50 text-sm placeholder:text-deep-400 dark:placeholder:text-gray-500 dark:text-gray-100 focus:outline-none focus:border-ocean-300 dark:focus:border-ocean-500 focus:bg-white dark:focus:bg-deep-800 focus:ring-4 focus:ring-ocean-100 dark:focus:ring-ocean-900/50 transition-all duration-200"
            />
            <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-deep-400 dark:text-gray-500 bg-gray-100 dark:bg-deep-700 rounded-md border border-gray-200 dark:border-gray-600">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon-sm" 
              className="text-deep-500 dark:text-gray-400 hover:text-deep-700 dark:hover:text-gray-200"
              onClick={() => setShowThemeMenu(!showThemeMenu)}
            >
              {resolvedTheme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            
            {/* Theme Dropdown */}
            {showThemeMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-deep-800 rounded-xl shadow-premium-lg border border-gray-200/50 dark:border-gray-700 overflow-hidden z-50 animate-scale-in">
                  <div className="p-1">
                    <button
                      onClick={() => { setTheme('light'); setShowThemeMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                        theme === 'light' 
                          ? "bg-ocean-50 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-300" 
                          : "text-deep-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-deep-700"
                      )}
                    >
                      <Sun className="w-4 h-4" />
                      Light
                    </button>
                    <button
                      onClick={() => { setTheme('dark'); setShowThemeMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                        theme === 'dark' 
                          ? "bg-ocean-50 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-300" 
                          : "text-deep-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-deep-700"
                      )}
                    >
                      <Moon className="w-4 h-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => { setTheme('system'); setShowThemeMenu(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                        theme === 'system' 
                          ? "bg-ocean-50 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-300" 
                          : "text-deep-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-deep-700"
                      )}
                    >
                      <Monitor className="w-4 h-4" />
                      System
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Help */}
          <Button variant="ghost" size="icon-sm" className="text-deep-500 dark:text-gray-400 hover:text-deep-700 dark:hover:text-gray-200">
            <HelpCircle className="w-4 h-4" />
          </Button>

          {/* Notifications */}
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon-sm" 
              className="text-deep-500 dark:text-gray-400 hover:text-deep-700 dark:hover:text-gray-200 relative"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-abyss-500 text-white rounded-full border-2 border-white dark:border-deep-900">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-deep-800 rounded-2xl shadow-premium-lg border border-gray-200/50 dark:border-gray-700 overflow-hidden z-50 animate-scale-in">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-deep-900 dark:text-gray-100">Notifications</h3>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={() => markAllAsRead()}
                            className="text-xs text-ocean-600 dark:text-ocean-400 hover:text-ocean-700 dark:hover:text-ocean-300 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            Mark all read
                          </button>
                        )}
                        <span className="px-2 py-0.5 text-xs font-medium bg-ocean-100 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-300 rounded-full">
                          {unreadCount} new
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm text-deep-500 dark:text-gray-400">No notifications yet</p>
                        <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">
                          You'll see updates about your data imports and analyses here
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div 
                          key={notification._id} 
                          className={cn(
                            "p-4 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-deep-700/50 transition-colors cursor-pointer group",
                            !notification.read && (notificationStyles[notification.type]?.bg || 'bg-ocean-50/30 dark:bg-ocean-900/20')
                          )}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex gap-3">
                            <div className={cn(
                              "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                              notification.read ? "bg-transparent" : (notificationStyles[notification.type]?.dot || 'bg-ocean-500')
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className={cn(
                                    "text-sm text-deep-900 dark:text-gray-100",
                                    !notification.read && "font-medium"
                                  )}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-deep-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                    {notification.description}
                                  </p>
                                  <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">
                                    {timeAgo(notification.createdAt)}
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification._id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-deep-400 hover:text-abyss-500 dark:text-gray-500 dark:hover:text-abyss-400 transition-all"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div className="p-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-deep-900/50">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full text-ocean-600 dark:text-ocean-400 hover:text-ocean-700 dark:hover:text-ocean-300"
                        onClick={() => {
                          setShowNotifications(false);
                          navigate('/admin?tab=audit');
                        }}
                      >
                        View all activity
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-2" />

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-3 p-1.5 pr-3 rounded-xl hover:bg-gray-100 dark:hover:bg-deep-800 transition-colors"
            >
              <Avatar
                fallback={user?.name?.charAt(0)}
                size="sm"
                status="online"
              />
              <div className="text-left hidden md:block">
                <p className="text-sm font-semibold text-deep-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-xs text-deep-500 dark:text-gray-400 capitalize">{user?.role}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-deep-400 dark:text-gray-500" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-deep-800 rounded-2xl shadow-premium-lg border border-gray-200/50 dark:border-gray-700 overflow-hidden z-50 animate-scale-in">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <Avatar
                        fallback={user?.name?.charAt(0)}
                        size="lg"
                        status="online"
                      />
                      <div>
                        <p className="font-semibold text-deep-900 dark:text-gray-100">{user?.name}</p>
                        <p className="text-sm text-deep-500 dark:text-gray-400">{user?.email}</p>
                        <span className="inline-flex items-center mt-1 px-2 py-0.5 text-xs font-medium bg-ocean-100 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-300 rounded-full capitalize">
                          {user?.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-deep-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-deep-700 rounded-lg transition-colors">
                      <User className="w-4 h-4" />
                      Profile Settings
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-deep-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-deep-700 rounded-lg transition-colors">
                      <Settings className="w-4 h-4" />
                      Preferences
                    </button>
                  </div>
                  <div className="p-2 border-t border-gray-100 dark:border-gray-700">
                    <button 
                      onClick={logout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-abyss-600 dark:text-abyss-400 hover:bg-abyss-50 dark:hover:bg-abyss-900/20 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
