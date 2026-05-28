// app/(admin)/admin/kyc/page.tsx
'use client'
import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LogOut, Search, Filter, Eye, CheckCircle, XCircle, Clock, User, Mail, Phone, Calendar } from 'lucide-react';
import { getAppRoute, getAuthRoute } from '@/lib/branding-routes';

interface KYCApplication {
  id: string;
  aadhaarNumber: string;
  panNumber: string;
  bankProofUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  approvedAt?: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    clientId: string;
    createdAt: string;
    role: string;
  };
}

interface StatusCounts {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
}

export default function AdminKYCPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [kycApplications, setKycApplications] = useState<KYCApplication[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ PENDING: 0, APPROVED: 0, REJECTED: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedKYC, setSelectedKYC] = useState<KYCApplication | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Check authentication and role
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(getAuthRoute("login"));
    } else if (status === 'authenticated' && session?.user) {
      const userRole = (session.user as any)?.role;
      if (userRole !== 'ADMIN' && userRole !== 'MODERATOR' && userRole !== 'SUPER_ADMIN') {
        router.push(getAppRoute("dashboard"));
      }
    }
  }, [status, session, router]);

  // Fetch KYC applications
  const fetchKYCApplications = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`/api/admin/kyc?${params}`);
      
      if (!response.ok) {
        if (response.status === 403) {
          setError('Access denied. Admin or Moderator role required.');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setKycApplications(data.kycApplications);
      setStatusCounts(data.statusCounts);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      console.error('Error fetching KYC applications:', err);
      setError('Failed to load KYC applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchKYCApplications();
    }
  }, [status, currentPage, statusFilter, searchTerm]);

  // Handle KYC status update
  const handleStatusUpdate = async (kycId: string, newStatus: 'APPROVED' | 'REJECTED', reason?: string) => {
    try {
      setActionLoading(kycId);
      
      const response = await fetch('/api/admin/kyc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kycId, status: newStatus, reason })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Refresh the data
      await fetchKYCApplications();
      setSelectedKYC(null);
    } catch (err) {
      console.error('Error updating KYC status:', err);
      setError('Failed to update KYC status');
    } finally {
      setActionLoading(null);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">KYC Management</h1>
              <p className="text-gray-600">Review and manage KYC applications</p>
            </div>
            <Button
              onClick={() => signOut({ callbackUrl: getAuthRoute("login") })}
              variant="outline"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="w-8 h-8 text-yellow-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.PENDING}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.APPROVED}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <XCircle className="w-8 h-8 text-red-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Rejected</p>
                  <p className="text-2xl font-bold text-gray-900">{statusCounts.REJECTED}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by name, email, phone, or client ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* KYC Applications Table */}
        <Card>
          <CardHeader>
            <CardTitle>KYC Applications</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              </div>
            ) : kycApplications.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No KYC applications found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aadhaar</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PAN</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {kycApplications.map((kyc) => (
                      <tr key={kyc.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{kyc.user.name}</div>
                            <div className="text-sm text-gray-500">{kyc.user.email}</div>
                            <div className="text-sm text-gray-500">{kyc.user.clientId}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {kyc.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1-****-****')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {kyc.panNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(kyc.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(kyc.submittedAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedKYC(kyc)}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>KYC Application Details</DialogTitle>
                                </DialogHeader>
                                {selectedKYC && (
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">User Name</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.user.name}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">Email</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.user.email}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">Phone</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.user.phone}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">Client ID</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.user.clientId}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">Aadhaar Number</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.aadhaarNumber}</p>
                                      </div>
                                      <div>
                                        <label className="text-sm font-medium text-gray-700">PAN Number</label>
                                        <p className="text-sm text-gray-900">{selectedKYC.panNumber}</p>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-gray-700">Bank Proof</label>
                                      <div className="mt-1">
                                        <a
                                          href={selectedKYC.bankProofUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-600 hover:text-emerald-700 underline"
                                        >
                                          View Document
                                        </a>
                                      </div>
                                    </div>
                                    {selectedKYC.status === 'PENDING' && (
                                      <div className="flex space-x-2 pt-4">
                                        <Button
                                          onClick={() => handleStatusUpdate(selectedKYC.id, 'APPROVED')}
                                          disabled={actionLoading === selectedKYC.id}
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          <CheckCircle className="w-4 h-4 mr-1" />
                                          Approve
                                        </Button>
                                        <Button
                                          onClick={() => handleStatusUpdate(selectedKYC.id, 'REJECTED')}
                                          disabled={actionLoading === selectedKYC.id}
                                          variant="destructive"
                                        >
                                          <XCircle className="w-4 h-4 mr-1" />
                                          Reject
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
