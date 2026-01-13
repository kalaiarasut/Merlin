/**
 * Institute Management Component - Admin Console
 * 
 * Allows system admins to view, create, and manage research institutes.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instituteService } from '@/services/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Building2, Users, Plus, Edit, Shield, MapPin,
    CheckCircle, XCircle, ChevronRight, Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Institute {
    _id: string;
    code: string;
    name: string;
    type: string;
    parentMinistry?: string;
    location: { city: string; state: string; country: string };
    settings: {
        defaultEmbargoMonths: number;
        allowPublicDatasets: boolean;
        requireApprovalForSharing: boolean;
    };
    status: 'active' | 'suspended';
    createdAt: string;
}

export const InstituteManagement: React.FC = () => {
    const queryClient = useQueryClient();
    const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newInstitute, setNewInstitute] = useState({
        code: '',
        name: '',
        type: 'government',
        parentMinistry: '',
        city: '',
        state: '',
    });

    const { data: institutesData, isLoading } = useQuery({
        queryKey: ['institutes'],
        queryFn: () => instituteService.getAll(),
    });

    const { data: membersData } = useQuery({
        queryKey: ['institute-members', selectedInstitute?._id],
        queryFn: () => instituteService.getMembers(selectedInstitute!._id),
        enabled: !!selectedInstitute,
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => instituteService.create(data),
        onSuccess: () => {
            toast.success('Institute created successfully');
            queryClient.invalidateQueries({ queryKey: ['institutes'] });
            setShowCreateForm(false);
            setNewInstitute({ code: '', name: '', type: 'government', parentMinistry: '', city: '', state: '' });
        },
        onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create institute'),
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, status, reason }: { id: string; status: 'active' | 'suspended'; reason: string }) =>
            instituteService.updateStatus(id, status, reason),
        onSuccess: () => {
            toast.success('Institute status updated');
            queryClient.invalidateQueries({ queryKey: ['institutes'] });
        },
        onError: () => toast.error('Failed to update status'),
    });

    const handleCreate = () => {
        createMutation.mutate({
            code: newInstitute.code.toUpperCase(),
            name: newInstitute.name,
            type: newInstitute.type,
            parentMinistry: newInstitute.parentMinistry,
            location: {
                city: newInstitute.city,
                state: newInstitute.state,
                country: 'India'
            }
        });
    };

    const handleStatusToggle = (institute: Institute) => {
        const newStatus = institute.status === 'active' ? 'suspended' : 'active';
        const reason = prompt(`Reason for ${newStatus === 'suspended' ? 'suspending' : 'activating'} this institute:`);
        if (reason) {
            statusMutation.mutate({ id: institute._id, status: newStatus, reason });
        }
    };

    const institutes = institutesData?.institutes || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-deep-900 dark:text-gray-100">Institute Management</h2>
                    <p className="text-sm text-deep-500 dark:text-gray-400">Manage research institutions and their settings</p>
                </div>
                <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Institute
                </Button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Create New Institute</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                placeholder="Code (e.g., CMLRE)"
                                value={newInstitute.code}
                                onChange={(e) => setNewInstitute({ ...newInstitute, code: e.target.value })}
                            />
                            <Input
                                placeholder="Full Name"
                                value={newInstitute.name}
                                onChange={(e) => setNewInstitute({ ...newInstitute, name: e.target.value })}
                            />
                            <Input
                                placeholder="Parent Ministry"
                                value={newInstitute.parentMinistry}
                                onChange={(e) => setNewInstitute({ ...newInstitute, parentMinistry: e.target.value })}
                            />
                            <select
                                className="px-3 py-2 border rounded-lg bg-white dark:bg-deep-800"
                                value={newInstitute.type}
                                onChange={(e) => setNewInstitute({ ...newInstitute, type: e.target.value })}
                            >
                                <option value="government">Government</option>
                                <option value="academic">Academic</option>
                                <option value="private">Private</option>
                                <option value="ngo">NGO</option>
                            </select>
                            <Input
                                placeholder="City"
                                value={newInstitute.city}
                                onChange={(e) => setNewInstitute({ ...newInstitute, city: e.target.value })}
                            />
                            <Input
                                placeholder="State"
                                value={newInstitute.state}
                                onChange={(e) => setNewInstitute({ ...newInstitute, state: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Button onClick={handleCreate} disabled={createMutation.isPending}>
                                Create Institute
                            </Button>
                            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Institute Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {isLoading ? (
                    <div className="col-span-2 text-center py-8 text-deep-500">Loading institutes...</div>
                ) : institutes.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-deep-500">
                        No institutes found. Create one to get started.
                    </div>
                ) : (
                    institutes.map((institute: Institute) => (
                        <Card
                            key={institute._id}
                            className={`cursor-pointer transition-all hover:shadow-lg ${selectedInstitute?._id === institute._id ? 'ring-2 ring-ocean-500' : ''
                                }`}
                            onClick={() => setSelectedInstitute(institute)}
                        >
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-ocean-50 dark:bg-ocean-900/30">
                                            <Building2 className="w-5 h-5 text-ocean-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-deep-900 dark:text-gray-100">{institute.code}</h3>
                                                <Badge variant={institute.status === 'active' ? 'success' : 'destructive'} size="sm">
                                                    {institute.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-deep-600 dark:text-gray-300">{institute.name}</p>
                                            <p className="text-xs text-deep-400 dark:text-gray-500 flex items-center gap-1 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                {institute.location.city}, {institute.location.state}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-deep-400" />
                                </div>

                                {/* Settings Summary */}
                                <div className="flex gap-4 mt-3 text-xs">
                                    <span className="flex items-center gap-1 text-deep-500 dark:text-gray-400">
                                        <Shield className="w-3 h-3" />
                                        {institute.settings.defaultEmbargoMonths}mo embargo
                                    </span>
                                    {institute.settings.allowPublicDatasets && (
                                        <span className="text-green-600 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            Public OK
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Selected Institute Details */}
            {selectedInstitute && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{selectedInstitute.code} - {selectedInstitute.name}</CardTitle>
                                <CardDescription>{selectedInstitute.parentMinistry}</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm">
                                    <Settings className="w-4 h-4 mr-2" />
                                    Edit Settings
                                </Button>
                                <Button
                                    variant={selectedInstitute.status === 'active' ? 'destructive' : 'success'}
                                    size="sm"
                                    onClick={() => handleStatusToggle(selectedInstitute)}
                                >
                                    {selectedInstitute.status === 'active' ? (
                                        <><XCircle className="w-4 h-4 mr-2" /> Suspend</>
                                    ) : (
                                        <><CheckCircle className="w-4 h-4 mr-2" /> Activate</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-deep-800">
                                <p className="text-xs text-deep-500 dark:text-gray-400">Default Embargo</p>
                                <p className="font-bold text-deep-900 dark:text-gray-100">
                                    {selectedInstitute.settings.defaultEmbargoMonths} months
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-deep-800">
                                <p className="text-xs text-deep-500 dark:text-gray-400">Public Datasets</p>
                                <p className="font-bold text-deep-900 dark:text-gray-100">
                                    {selectedInstitute.settings.allowPublicDatasets ? 'Allowed' : 'Not Allowed'}
                                </p>
                            </div>
                            <div className="p-3 rounded-lg bg-gray-50 dark:bg-deep-800">
                                <p className="text-xs text-deep-500 dark:text-gray-400">Sharing Approval</p>
                                <p className="font-bold text-deep-900 dark:text-gray-100">
                                    {selectedInstitute.settings.requireApprovalForSharing ? 'Required' : 'Not Required'}
                                </p>
                            </div>
                        </div>

                        {/* Members */}
                        <div className="border-t pt-4">
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Members ({membersData?.total || 0})
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {membersData?.members?.map((member: any) => (
                                    <div key={member._id} className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-deep-800">
                                        <div>
                                            <p className="font-medium text-sm text-deep-900 dark:text-gray-100">{member.name}</p>
                                            <p className="text-xs text-deep-500 dark:text-gray-400">{member.email}</p>
                                        </div>
                                        <Badge variant={member.role === 'institute-admin' ? 'premium' : 'secondary'} size="sm">
                                            {member.role}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default InstituteManagement;
