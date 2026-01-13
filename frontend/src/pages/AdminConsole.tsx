import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input, Select } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatCard } from '@/components/ui/stat-card';
import { userService, analyticsService } from '@/services/api';
import {
  Settings, Users, Activity, Database, Server, HardDrive,
  Cpu, MemoryStick, Wifi, AlertTriangle, CheckCircle2, XCircle,
  Clock, RefreshCw, Download, Search, X,
  UserPlus, Edit, Trash2, Lock, Mail,
  FileText, BarChart3, Zap, Loader, Building, KeyRound, GitCommit
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuditLogViewer, ReproducibilityDashboard } from '@/components/audit';
import { InstituteManagement } from '@/components/admin/InstituteManagement';
import { ProjectManagement } from '@/components/admin/ProjectManagement';
import { Building2, FolderKanban } from 'lucide-react';

// Types
interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'researcher' | 'viewer';
  status: 'active' | 'inactive' | 'pending';
  organization: string;
  lastActive?: string;
  createdAt: string;
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  status: string;
  organization: string;
}

// Modal Component
function Modal({ isOpen, onClose, title, children }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-deep-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-deep-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Confirmation Dialog
function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, isLoading }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isLoading?: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-abyss-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-abyss-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-deep-900">{title}</h3>
            <p className="text-sm text-deep-500">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-abyss-600 hover:bg-abyss-700"
          >
            {isLoading ? <Loader className="w-4 h-4 animate-spin mr-2" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// Static data for system metrics
const systemMetrics = {
  cpu: 42,
  memory: 68,
  storage: 54,
  network: 'Healthy',
  uptime: '45 days, 12 hours',
  requests: '12.4k/min',
};

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    name: '',
    email: '',
    password: '',
    role: 'researcher',
    status: 'active',
    organization: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<UserFormData>>({});

  const queryClient = useQueryClient();

  // Fetch users from API
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users', searchQuery, roleFilter, statusFilter],
    queryFn: () => userService.getAll({
      search: searchQuery || undefined,
      role: roleFilter || undefined,
      status: statusFilter || undefined
    }),
  });

  // Fetch user stats
  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: () => userService.getStats(),
  });

  // Fetch analytics stats for overview
  const { data: analyticsStats } = useQuery({
    queryKey: ['admin-analytics-stats'],
    queryFn: () => analyticsService.getStats(),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: UserFormData) => userService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] });
      setIsAddUserOpen(false);
      resetForm();
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserFormData> }) =>
      userService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] });
      setIsEditUserOpen(false);
      setSelectedUser(null);
      resetForm();
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => userService.delete(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-stats'] });
      setIsDeleteOpen(false);
      setSelectedUser(null);
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      userService.resetPassword(id, password),
    onSuccess: () => {
      setIsResetPasswordOpen(false);
      setSelectedUser(null);
      setNewPassword('');
    },
  });

  const users = usersData?.users || [];
  const totalUsers = userStats?.totalUsers || users.length || 0;
  const activeUsers = userStats?.activeUsers || 0;
  const adminCount = userStats?.adminUsers || 0;
  const researcherCount = userStats?.researcherUsers || 0;

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'researcher',
      status: 'active',
      organization: '',
    });
    setFormErrors({});
  };

  const validateForm = (isEdit = false): boolean => {
    const errors: Partial<UserFormData> = {};

    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    if (!isEdit && !formData.password) errors.password = 'Password is required';
    else if (!isEdit && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    if (!formData.organization.trim()) errors.organization = 'Organization is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddUser = () => {
    if (!validateForm()) return;
    createUserMutation.mutate(formData);
  };

  const handleEditUser = () => {
    if (!selectedUser || !validateForm(true)) return;
    const { password, ...updateData } = formData;
    updateUserMutation.mutate({ id: selectedUser._id, data: updateData });
  };

  const handleDeleteUser = () => {
    if (!selectedUser) return;
    deleteUserMutation.mutate(selectedUser._id);
  };

  const handleResetPassword = () => {
    if (!selectedUser || newPassword.length < 6) return;
    resetPasswordMutation.mutate({ id: selectedUser._id, password: newPassword });
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      status: user.status,
      organization: user.organization,
    });
    setIsEditUserOpen(true);
  };

  const openDeleteModal = (user: User) => {
    setSelectedUser(user);
    setIsDeleteOpen(true);
  };

  const openResetPasswordModal = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setIsResetPasswordOpen(true);
  };

  // Audit logs (simulated based on recent activity)
  const auditLogs = (analyticsStats?.recentActivity || []).map((activity: any, index: number) => ({
    id: activity.id || index,
    action: activity.action || 'System Activity',
    user: activity.user || 'System',
    ip: activity.ip || '127.0.0.1',
    timestamp: new Date(activity.timestamp || Date.now() - index * 300000),
    status: activity.type === 'error' ? 'failed' : 'success',
  }));

  // Fallback audit logs if none from API
  const displayAuditLogs = auditLogs.length > 0 ? auditLogs : [
    { id: 1, action: 'System Started', user: 'System', ip: '127.0.0.1', timestamp: new Date(), status: 'success' },
    { id: 2, action: 'Admin Login', user: 'Administrator', ip: '192.168.1.1', timestamp: new Date(Date.now() - 300000), status: 'success' },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'institutes', label: 'Institutes', icon: Building2 },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'system', label: 'System', icon: Server },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'reproducibility', label: 'Reproducibility', icon: GitCommit },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-ocean-500" />
            <span className="text-sm font-medium text-ocean-600">Administration</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-deep-900">Admin Console</h1>
          <p className="text-deep-500 mt-1">
            System administration, user management, and monitoring
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => refetchUsers()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="premium" onClick={() => { resetForm(); setIsAddUserOpen(true); }}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 py-3 px-1 border-b-2 transition-colors text-sm font-medium",
                activeTab === tab.id
                  ? "border-ocean-500 text-ocean-600"
                  : "border-transparent text-deep-500 hover:text-deep-700"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Users"
              value={totalUsers.toString()}
              subtitle={`${adminCount} admins, ${researcherCount} researchers`}
              icon={Users}
              iconColor="text-ocean-400"
              iconBg="bg-ocean-50/60"
              loading={statsLoading}
            />
            <StatCard
              title="Active Users"
              value={activeUsers.toString()}
              subtitle="currently active"
              icon={Activity}
              iconColor="text-marine-400"
              iconBg="bg-marine-50/60"
              loading={statsLoading}
            />
            <StatCard
              title="Total Species"
              value={(analyticsStats?.totalSpecies || 0).toLocaleString()}
              subtitle="in database"
              icon={Database}
              iconColor="text-coral-400"
              iconBg="bg-coral-50/60"
            />
            <StatCard
              title="Data Records"
              value={((analyticsStats?.totalOccurrences || 0) + (analyticsStats?.totalOtoliths || 0)).toLocaleString()}
              subtitle="total entries"
              icon={BarChart3}
              iconColor="text-deep-400"
              iconBg="bg-deep-100/50"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* System Health */}
            <Card variant="default" className="lg:col-span-2">
              <CardHeader>
                <CardTitle>System Health</CardTitle>
                <CardDescription>Real-time infrastructure monitoring</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-deep-600">
                        <Cpu className="w-4 h-4" /> CPU Usage
                      </span>
                      <span className="font-semibold text-deep-900">{systemMetrics.cpu}%</span>
                    </div>
                    <Progress value={systemMetrics.cpu} variant={systemMetrics.cpu > 80 ? 'warning' : 'default'} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-deep-600">
                        <MemoryStick className="w-4 h-4" /> Memory
                      </span>
                      <span className="font-semibold text-deep-900">{systemMetrics.memory}%</span>
                    </div>
                    <Progress value={systemMetrics.memory} variant={systemMetrics.memory > 80 ? 'warning' : 'default'} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-deep-600">
                        <HardDrive className="w-4 h-4" /> Storage
                      </span>
                      <span className="font-semibold text-deep-900">{systemMetrics.storage}%</span>
                    </div>
                    <Progress value={systemMetrics.storage} variant="default" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Wifi className="w-4 h-4 text-marine-500" />
                      <span className="text-sm text-deep-500">Network</span>
                    </div>
                    <p className="font-semibold text-deep-900">{systemMetrics.network}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-ocean-500" />
                      <span className="text-sm text-deep-500">Uptime</span>
                    </div>
                    <p className="font-semibold text-deep-900">{systemMetrics.uptime}</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-coral-500" />
                      <span className="text-sm text-deep-500">Requests</span>
                    </div>
                    <p className="font-semibold text-deep-900">{systemMetrics.requests}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Users */}
            <Card variant="default">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Users</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('users')}>
                    View All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(userStats?.recentUsers || []).slice(0, 4).map((user: User) => (
                  <div
                    key={user._id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                  >
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-br from-ocean-500 to-marine-600 text-white text-sm">
                        {user.name?.split(' ').map(n => n[0]).join('') || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-deep-900 truncate">{user.name}</p>
                      <p className="text-xs text-deep-500 truncate">{user.email}</p>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'premium' : 'secondary'} size="sm">
                      {user.role}
                    </Badge>
                  </div>
                ))}
                {(!userStats?.recentUsers || userStats.recentUsers.length === 0) && (
                  <p className="text-sm text-deep-400 text-center py-4">No users yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or email..."
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <Select
              className="w-40"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="researcher">Researcher</option>
              <option value="viewer">Viewer</option>
            </Select>
            <Select
              className="w-40"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </Select>
          </div>

          {/* Users Table */}
          <Card variant="default">
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-ocean-500" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-deep-200 mb-4" />
                  <p className="text-deep-500 font-medium">No users found</p>
                  <p className="text-sm text-deep-400 mb-4">Try adjusting your filters or add a new user</p>
                  <Button variant="outline" onClick={() => { resetForm(); setIsAddUserOpen(true); }}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-deep-700">User</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-deep-700">Organization</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-deep-700">Role</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-deep-700">Status</th>
                        <th className="text-left py-4 px-6 text-sm font-semibold text-deep-700">Joined</th>
                        <th className="text-right py-4 px-6 text-sm font-semibold text-deep-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((user: User) => (
                        <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-gradient-to-br from-ocean-500 to-marine-600 text-white">
                                  {user.name?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-deep-900">{user.name}</p>
                                <p className="text-sm text-deep-500">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className="text-sm text-deep-600">{user.organization}</span>
                          </td>
                          <td className="py-4 px-6">
                            <Badge variant={user.role === 'admin' ? 'premium' : user.role === 'researcher' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            <Badge
                              variant={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'outline'}
                              dot
                            >
                              {user.status}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-sm text-deep-500">
                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEditModal(user)}
                                title="Edit user"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openResetPasswordModal(user)}
                                title="Reset password"
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-abyss-600 hover:text-abyss-700"
                                onClick={() => openDeleteModal(user)}
                                title="Delete user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination info */}
          {usersData?.pagination && (
            <div className="flex items-center justify-between text-sm text-deep-500">
              <span>
                Showing {users.length} of {usersData.pagination.total} users
              </span>
              <span>
                Page {usersData.pagination.page} of {usersData.pagination.pages}
              </span>
            </div>
          )}
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card variant="default">
            <CardHeader>
              <CardTitle>Database Status</CardTitle>
              <CardDescription>Connected database services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-marine-100 rounded-lg">
                    <Database className="w-5 h-5 text-marine-600" />
                  </div>
                  <div>
                    <span className="font-medium">MongoDB Atlas</span>
                    <p className="text-xs text-deep-500">Primary database</p>
                  </div>
                </div>
                <Badge variant="success" dot>Connected</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ocean-100 rounded-lg">
                    <Database className="w-5 h-5 text-ocean-600" />
                  </div>
                  <div>
                    <span className="font-medium">PostgreSQL</span>
                    <p className="text-xs text-deep-500">Geospatial data</p>
                  </div>
                </div>
                <Badge variant="success" dot>Connected</Badge>
              </div>
            </CardContent>
          </Card>

          <Card variant="default">
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>Backend service status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ocean-100 rounded-lg">
                    <Server className="w-5 h-5 text-ocean-600" />
                  </div>
                  <div>
                    <span className="font-medium">API Backend</span>
                    <p className="text-xs text-deep-500">Express.js server</p>
                  </div>
                </div>
                <Badge variant="success" dot>Running</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-coral-100 rounded-lg">
                    <Zap className="w-5 h-5 text-coral-600" />
                  </div>
                  <div>
                    <span className="font-medium">AI Services</span>
                    <p className="text-xs text-deep-500">FastAPI ML server</p>
                  </div>
                </div>
                <Badge variant="success" dot>Running</Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-deep-100 rounded-lg">
                    <Activity className="w-5 h-5 text-deep-600" />
                  </div>
                  <div>
                    <span className="font-medium">Background Jobs</span>
                    <p className="text-xs text-deep-500">Data processing</p>
                  </div>
                </div>
                <Badge variant="default" dot>Idle</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Environment Info */}
          <Card variant="default" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Environment</CardTitle>
              <CardDescription>Current deployment configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-deep-500 mb-1">Environment</p>
                  <p className="font-semibold text-deep-900">Development</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-deep-500 mb-1">API Version</p>
                  <p className="font-semibold text-deep-900">v1.0.0</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-deep-500 mb-1">Node.js</p>
                  <p className="font-semibold text-deep-900">v20.x</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-deep-500 mb-1">Python</p>
                  <p className="font-semibold text-deep-900">v3.11</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit Tab (REAL IMPLEMENTATION) */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          <AuditLogViewer />
        </div>
      )}

      {/* Reproducibility Tab */}
      {activeTab === 'reproducibility' && (
        <div className="space-y-6">
          <ReproducibilityDashboard />
        </div>
      )}

      {/* Institutes Tab */}
      {activeTab === 'institutes' && (
        <div className="space-y-6">
          <InstituteManagement />
        </div>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          <ProjectManagement />
        </div>
      )}

      {/* Add User Modal */}
      <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add New User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Full Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter full name"
              icon={<Users className="w-4 h-4" />}
            />
            {formErrors.name && <p className="text-sm text-abyss-600 mt-1">{formErrors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Email Address</label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
              icon={<Mail className="w-4 h-4" />}
            />
            {formErrors.email && <p className="text-sm text-abyss-600 mt-1">{formErrors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Password</label>
            <Input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Enter password (min 6 characters)"
              icon={<Lock className="w-4 h-4" />}
            />
            {formErrors.password && <p className="text-sm text-abyss-600 mt-1">{formErrors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Organization</label>
            <Input
              value={formData.organization}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              placeholder="Enter organization name"
              icon={<Building className="w-4 h-4" />}
            />
            {formErrors.organization && <p className="text-sm text-abyss-600 mt-1">{formErrors.organization}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-deep-700 mb-1">Role</label>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="researcher">Researcher</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-700 mb-1">Status</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsAddUserOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="premium"
              className="flex-1"
              onClick={handleAddUser}
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending && <Loader className="w-4 h-4 animate-spin mr-2" />}
              Add User
            </Button>
          </div>

          {createUserMutation.isError && (
            <p className="text-sm text-abyss-600 text-center">
              {(createUserMutation.error as any)?.response?.data?.message || 'Failed to create user'}
            </p>
          )}
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={isEditUserOpen} onClose={() => setIsEditUserOpen(false)} title="Edit User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Full Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter full name"
              icon={<Users className="w-4 h-4" />}
            />
            {formErrors.name && <p className="text-sm text-abyss-600 mt-1">{formErrors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Email Address</label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
              icon={<Mail className="w-4 h-4" />}
            />
            {formErrors.email && <p className="text-sm text-abyss-600 mt-1">{formErrors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">Organization</label>
            <Input
              value={formData.organization}
              onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
              placeholder="Enter organization name"
              icon={<Building className="w-4 h-4" />}
            />
            {formErrors.organization && <p className="text-sm text-abyss-600 mt-1">{formErrors.organization}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-deep-700 mb-1">Role</label>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="researcher">Researcher</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-deep-700 mb-1">Status</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsEditUserOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="premium"
              className="flex-1"
              onClick={handleEditUser}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending && <Loader className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </div>

          {updateUserMutation.isError && (
            <p className="text-sm text-abyss-600 text-center">
              {(updateUserMutation.error as any)?.response?.data?.message || 'Failed to update user'}
            </p>
          )}
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal isOpen={isResetPasswordOpen} onClose={() => setIsResetPasswordOpen(false)} title="Reset Password">
        <div className="space-y-4">
          <p className="text-sm text-deep-500">
            Reset password for <span className="font-semibold text-deep-900">{selectedUser?.name}</span>
          </p>

          <div>
            <label className="block text-sm font-medium text-deep-700 mb-1">New Password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 characters)"
              icon={<Lock className="w-4 h-4" />}
            />
            {newPassword && newPassword.length < 6 && (
              <p className="text-sm text-abyss-600 mt-1">Password must be at least 6 characters</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsResetPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="premium"
              className="flex-1"
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending || newPassword.length < 6}
            >
              {resetPasswordMutation.isPending && <Loader className="w-4 h-4 animate-spin mr-2" />}
              Reset Password
            </Button>
          </div>

          {resetPasswordMutation.isError && (
            <p className="text-sm text-abyss-600 text-center">
              Failed to reset password
            </p>
          )}
          {resetPasswordMutation.isSuccess && (
            <p className="text-sm text-marine-600 text-center">
              Password reset successfully!
            </p>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete "${selectedUser?.name}"? This action cannot be undone.`}
        isLoading={deleteUserMutation.isPending}
      />
    </div>
  );
}
