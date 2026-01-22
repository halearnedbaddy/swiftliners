import { Search, MoreVertical, BadgeCheck, Loader, Download, Phone, Mail, Shield } from 'lucide-react';
import { useState } from 'react';
import { useAdminData } from '@/hooks/useAdminData';
import { exportToCSV } from '@/utils/csvExport';

export function AdminUsers() {
    const [activeTab, setActiveTab] = useState<'ALL' | 'SELLER' | 'BUYER'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const { users, loading, error } = useAdminData();

    const filteredUsers = users.filter(u => {
        // Exclude admins from this view
        if (u.role === 'ADMIN') return false;
        
        const matchesTab = activeTab === 'ALL' || u.role === activeTab;
        const matchesSearch = 
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.phone?.includes(searchTerm)) ||
            (u.email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            u.id.includes(searchTerm);
        
        return matchesTab && matchesSearch;
    });

    const handleExportCSV = () => {
        const exportData = filteredUsers.map(user => ({
            id: user.id,
            name: user.name,
            phone: user.phone || '-',
            email: user.email || '-',
            role: user.role,
            signupMethod: user.signupMethod === 'PHONE_OTP' ? 'Phone OTP' : 'Email',
            accountStatus: user.accountStatus,
            isPhoneVerified: user.isPhoneVerified ? 'Yes' : 'No',
            isEmailVerified: user.isEmailVerified ? 'Yes' : 'No',
            isActive: user.isActive ? 'Yes' : 'No',
            availableBalance: user.wallet?.availableBalance || 0,
            pendingBalance: user.wallet?.pendingBalance || 0,
            joinedAt: new Date(user.memberSince).toISOString(),
        }));

        const columns = [
            { key: 'id' as const, label: 'User ID' },
            { key: 'name' as const, label: 'Name' },
            { key: 'phone' as const, label: 'Phone' },
            { key: 'email' as const, label: 'Email' },
            { key: 'role' as const, label: 'Role' },
            { key: 'signupMethod' as const, label: 'Signup Method' },
            { key: 'accountStatus' as const, label: 'Account Status' },
            { key: 'isPhoneVerified' as const, label: 'Phone Verified' },
            { key: 'isEmailVerified' as const, label: 'Email Verified' },
            { key: 'isActive' as const, label: 'Active' },
            { key: 'availableBalance' as const, label: 'Available Balance (KES)' },
            { key: 'pendingBalance' as const, label: 'Pending Balance (KES)' },
            { key: 'joinedAt' as const, label: 'Joined At' },
        ];

        const filename = activeTab === 'ALL' 
            ? `all_users_${new Date().toISOString().split('T')[0]}`
            : `${activeTab.toLowerCase()}s_${new Date().toISOString().split('T')[0]}`;
        
        exportToCSV(exportData, filename, columns);
    };

    const getSignupMethodBadge = (method: string) => {
        switch (method) {
            case 'PHONE_OTP':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-null-full text-xs font-semibold bg-[#5d2ba3]/10 text-[#5d2ba3]">
                        <Phone size={12} /> Phone OTP
                    </span>
                );
            case 'EMAIL_PASSWORD':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-null-full text-xs font-semibold bg-[#5d2ba3]/10 text-[#5d2ba3]">
                        <Mail size={12} /> Email
                    </span>
                );
            case 'ADMIN_CREATED':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-null-full text-xs font-semibold bg-[#4F4A41]/10 text-[#4F4A41]">
                        <Shield size={12} /> Admin
                    </span>
                );
            default:
                return <span className="text-xs text-gray-400">-</span>;
        }
    };

    const getStatusBadge = (user: typeof users[0]) => {
        if (user.accountStatus === 'SUSPENDED') {
            return (
                <span className="px-2 py-1 rounded-null-full text-xs font-bold uppercase bg-red-100 text-red-700">
                    Suspended
                </span>
            );
        }
        if (!user.isActive) {
            return (
                <span className="px-2 py-1 rounded-null-full text-xs font-bold uppercase bg-gray-100 text-gray-600">
                    Inactive
                </span>
            );
        }
        if (user.isVerified) {
            return (
                <span className="px-2 py-1 rounded-null-full text-xs font-bold uppercase bg-[#5d2ba3]/10 text-[#5d2ba3]">
                    Active
                </span>
            );
        }
        return (
            <span className="px-2 py-1 rounded-null-full text-xs font-bold uppercase bg-[#4F4A41]/10 text-[#4F4A41]">
                Pending
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader size={32} className="animate-spin text-[#5d2ba3]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-null p-6 text-red-700">
                <p className="font-bold">Failed to load users</p>
                <p className="text-sm">{error}</p>
            </div>
        );
    }

    const totalSellers = users.filter(u => u.role === 'SELLER').length;
    const totalBuyers = users.filter(u => u.role === 'BUYER').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-[#3d1a7a]">User Management</h2>
                <button 
                    onClick={handleExportCSV}
                    disabled={filteredUsers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-[#3d1a7a] text-white rounded-null text-sm font-semibold hover:bg-[#250e52] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Download size={16} /> Export Users
                </button>
            </div>

            <div className="bg-white rounded-null border border-gray-200 shadow-sm overflow-hidden">
                <div className="border-b border-gray-200">
                    <nav className="flex gap-6 px-6">
                        <button
                            onClick={() => setActiveTab('ALL')}
                            className={`py-4 text-sm font-bold border-b-2 transition ${activeTab === 'ALL' ? 'border-[#5d2ba3] text-[#5d2ba3]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            All Users ({totalSellers + totalBuyers})
                        </button>
                        <button
                            onClick={() => setActiveTab('SELLER')}
                            className={`py-4 text-sm font-bold border-b-2 transition ${activeTab === 'SELLER' ? 'border-[#5d2ba3] text-[#5d2ba3]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Sellers ({totalSellers})
                        </button>
                        <button
                            onClick={() => setActiveTab('BUYER')}
                            className={`py-4 text-sm font-bold border-b-2 transition ${activeTab === 'BUYER' ? 'border-[#5d2ba3] text-[#5d2ba3]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Buyers ({totalBuyers})
                        </button>
                    </nav>
                </div>

                <div className="p-4 border-b border-gray-200 bg-gray-50">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search by name, phone, email, or ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-null focus:outline-none focus:border-[#3d1a7a] text-sm"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-white text-gray-500 text-xs uppercase font-semibold border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">User Details</th>
                                <th className="px-6 py-4">Signup Method</th>
                                <th className="px-6 py-4">Verification</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Balance</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-[#3d1a7a]">{user.name}</p>
                                                    <span className={`px-2 py-0.5 rounded-null-full text-[10px] font-bold uppercase ${
                                                        user.role === 'SELLER' ? 'bg-[#5d2ba3]/10 text-[#5d2ba3]' : 'bg-[#5d2ba3]/10 text-[#5d2ba3]'
                                                    }`}>
                                                        {user.role}
                                                    </span>
                                                </div>
                                                <div className="mt-1 space-y-0.5">
                                                    {user.email && (
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <Mail size={10} /> {user.email}
                                                        </p>
                                                    )}
                                                    {user.phone && (
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <Phone size={10} /> {user.phone}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getSignupMethodBadge(user.signupMethod)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {user.phone && (
                                                    <span className={`inline-flex items-center gap-1 text-xs ${
                                                        user.isPhoneVerified ? 'text-[#5d2ba3]' : 'text-gray-400'
                                                    }`}>
                                                        {user.isPhoneVerified ? <BadgeCheck size={12} /> : null}
                                                        Phone {user.isPhoneVerified ? '✓' : '—'}
                                                    </span>
                                                )}
                                                {user.email && (
                                                    <span className={`inline-flex items-center gap-1 text-xs ${
                                                        user.isEmailVerified ? 'text-[#5d2ba3]' : 'text-gray-400'
                                                    }`}>
                                                        {user.isEmailVerified ? <BadgeCheck size={12} /> : null}
                                                        Email {user.isEmailVerified ? '✓' : '—'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(user)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm">
                                                <p className="font-semibold text-gray-900">KES {(user.wallet?.availableBalance || 0).toLocaleString()}</p>
                                                <p className="text-xs text-gray-500">Pending: {(user.wallet?.pendingBalance || 0).toLocaleString()}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-500">
                                                <p>{new Date(user.memberSince).toLocaleDateString()}</p>
                                                <p className="text-xs">{new Date(user.memberSince).toLocaleTimeString()}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-gray-400 hover:text-gray-600">
                                                <MoreVertical size={20} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                        No users found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
