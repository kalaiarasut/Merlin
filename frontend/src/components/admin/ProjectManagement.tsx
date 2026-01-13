/**
 * Project Management Component - Admin Console
 * 
 * Allows users to view, create, and manage research projects.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService, userService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import {
    FolderKanban, Users, Plus, Calendar, Eye, Lock, Globe,
    ChevronRight, Clock, Shield, UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Project {
    _id: string;
    code: string;
    name: string;
    description?: string;
    instituteId: { _id: string; code: string; name: string };
    status: 'planning' | 'active' | 'completed' | 'archived';
    startDate: string;
    endDate?: string;
    members: Array<{ userId: { _id: string; name: string; email: string }; role: string }>;
    dataPolicy: {
        embargoEndDate?: string;
        storedVisibility: 'private' | 'institute' | 'public';
        license: string;
    };
    createdAt: string;
}

const statusColors: Record<string, string> = {
    planning: 'secondary',
    active: 'success',
    completed: 'default',
    archived: 'outline'
};

const visibilityIcons: Record<string, React.ReactNode> = {
    private: <Lock className="w-3 h-3" />,
    institute: <Shield className="w-3 h-3" />,
    public: <Globe className="w-3 h-3" />
};

export const ProjectManagement: React.FC = () => {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newProject, setNewProject] = useState({
        code: '',
        name: '',
        description: '',
        visibility: 'private',
        license: 'Government-Open'
    });

    const isAdmin = user?.role === 'admin' || user?.role === 'institute-admin';

    const { data: projectsData, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => projectService.getAll(),
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => projectService.create(data),
        onSuccess: () => {
            toast.success('Project created successfully');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setShowCreateForm(false);
            setNewProject({ code: '', name: '', description: '', visibility: 'private', license: 'Government-Open' });
        },
        onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create project'),
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            projectService.update(id, { status }),
        onSuccess: () => {
            toast.success('Project status updated');
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
        onError: () => toast.error('Failed to update status'),
    });

    const handleCreate = () => {
        createMutation.mutate({
            code: newProject.code.toUpperCase(),
            name: newProject.name,
            description: newProject.description,
            startDate: new Date().toISOString(),
            dataPolicy: {
                storedVisibility: newProject.visibility,
                license: newProject.license
            }
        });
    };

    const handleStatusChange = (project: Project, newStatus: string) => {
        if (confirm(`Change status from ${project.status} to ${newStatus}?`)) {
            updateStatusMutation.mutate({ id: project._id, status: newStatus });
        }
    };

    const projects = projectsData?.projects || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-deep-900 dark:text-gray-100">Project Management</h2>
                    <p className="text-sm text-deep-500 dark:text-gray-400">Manage research projects and team members</p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                )}
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Create New Project</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                placeholder="Project Code (e.g., FORCIS-2024)"
                                value={newProject.code}
                                onChange={(e) => setNewProject({ ...newProject, code: e.target.value })}
                            />
                            <Input
                                placeholder="Project Name"
                                value={newProject.name}
                                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                            />
                            <div className="col-span-2">
                                <Textarea
                                    placeholder="Description (optional)"
                                    value={newProject.description}
                                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                                    rows={2}
                                />
                            </div>
                            <select
                                className="px-3 py-2 border rounded-lg bg-white dark:bg-deep-800"
                                value={newProject.visibility}
                                onChange={(e) => setNewProject({ ...newProject, visibility: e.target.value })}
                            >
                                <option value="private">Private (Team Only)</option>
                                <option value="institute">Institute (All Members)</option>
                                <option value="public">Public (After Embargo)</option>
                            </select>
                            <select
                                className="px-3 py-2 border rounded-lg bg-white dark:bg-deep-800"
                                value={newProject.license}
                                onChange={(e) => setNewProject({ ...newProject, license: e.target.value })}
                            >
                                <option value="Government-Open">Government Open Data</option>
                                <option value="CC-BY">CC-BY (Attribution)</option>
                                <option value="CC-BY-NC">CC-BY-NC (Non-Commercial)</option>
                                <option value="Restricted">Restricted</option>
                            </select>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button onClick={handleCreate} disabled={createMutation.isPending}>
                                Create Project
                            </Button>
                            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Project List */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Projects Column */}
                <div className="lg:col-span-2 space-y-3">
                    {isLoading ? (
                        <div className="text-center py-8 text-deep-500">Loading projects...</div>
                    ) : projects.length === 0 ? (
                        <Card>
                            <CardContent className="text-center py-8 text-deep-500">
                                <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>No projects found.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        projects.map((project: Project) => (
                            <Card
                                key={project._id}
                                className={`cursor-pointer transition-all hover:shadow-lg ${selectedProject?._id === project._id ? 'ring-2 ring-ocean-500' : ''
                                    }`}
                                onClick={() => setSelectedProject(project)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/30">
                                                <FolderKanban className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-deep-900 dark:text-gray-100">{project.code}</h3>
                                                    <Badge variant={statusColors[project.status] as any} size="sm">
                                                        {project.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-deep-600 dark:text-gray-300">{project.name}</p>
                                                <p className="text-xs text-deep-400 dark:text-gray-500 mt-1">
                                                    {project.instituteId?.code || 'Unknown Institute'}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-deep-400" />
                                    </div>

                                    {/* Quick Info */}
                                    <div className="flex gap-4 mt-3 text-xs text-deep-500 dark:text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Users className="w-3 h-3" />
                                            {project.members?.length || 0} members
                                        </span>
                                        <span className="flex items-center gap-1">
                                            {visibilityIcons[project.dataPolicy.storedVisibility]}
                                            {project.dataPolicy.storedVisibility}
                                        </span>
                                        {project.dataPolicy.embargoEndDate && (
                                            <span className="flex items-center gap-1 text-amber-600">
                                                <Clock className="w-3 h-3" />
                                                Embargo until {new Date(project.dataPolicy.embargoEndDate).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Detail Panel */}
                <div className="lg:col-span-1">
                    {selectedProject ? (
                        <Card className="sticky top-4">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{selectedProject.code}</CardTitle>
                                <CardDescription>{selectedProject.name}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {selectedProject.description && (
                                    <p className="text-sm text-deep-600 dark:text-gray-300">{selectedProject.description}</p>
                                )}

                                {/* Status Actions */}
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-deep-500">Status</p>
                                    <div className="flex gap-1">
                                        {['planning', 'active', 'completed', 'archived'].map(status => (
                                            <Button
                                                key={status}
                                                variant={selectedProject.status === status ? 'default' : 'ghost'}
                                                size="sm"
                                                onClick={() => handleStatusChange(selectedProject, status)}
                                                disabled={selectedProject.status === status}
                                                className="text-xs capitalize"
                                            >
                                                {status}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Data Policy */}
                                <div className="p-3 rounded-lg bg-gray-50 dark:bg-deep-800 space-y-2">
                                    <p className="text-xs font-medium text-deep-500">Data Policy</p>
                                    <div className="flex items-center gap-2">
                                        {visibilityIcons[selectedProject.dataPolicy.storedVisibility]}
                                        <span className="text-sm capitalize">{selectedProject.dataPolicy.storedVisibility}</span>
                                    </div>
                                    <Badge variant="outline" size="sm">{selectedProject.dataPolicy.license}</Badge>
                                </div>

                                {/* Members */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-medium text-deep-500">Team Members</p>
                                        <Button variant="ghost" size="sm" className="h-6 text-xs">
                                            <UserPlus className="w-3 h-3 mr-1" />
                                            Add
                                        </Button>
                                    </div>
                                    <div className="space-y-1">
                                        {selectedProject.members?.map((member, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-deep-800">
                                                <span className="text-sm">{member.userId?.name || 'Unknown'}</span>
                                                <Badge variant="outline" size="sm">{member.role}</Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Dates */}
                                <div className="text-xs text-deep-400">
                                    <p>Started: {new Date(selectedProject.startDate).toLocaleDateString()}</p>
                                    {selectedProject.endDate && (
                                        <p>Ends: {new Date(selectedProject.endDate).toLocaleDateString()}</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="text-center py-12">
                                <FolderKanban className="w-10 h-10 mx-auto mb-3 text-deep-300" />
                                <p className="text-sm text-deep-500">Select a project to view details</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProjectManagement;
