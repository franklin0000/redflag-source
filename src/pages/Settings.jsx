import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userExtras, authExtras, usersApi, getToken } from '../services/api';
import { secureRemove } from '../services/secureStorage';

// ── Reusable Modal ──────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-[#1a202c] rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a202c]">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <span className="material-icons text-gray-500">close</span>
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

export default function Settings() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [loading, setLoading] = useState(false);
    const [twoFA, setTwoFA] = useState(false);
    const [profileVisible, setProfileVisible] = useState(true);
    const [emailNotifs, setEmailNotifs] = useState(true);
    const [pushNotifs, setPushNotifs] = useState(true);
    const [smsNotifs, setSmsNotifs] = useState(false);
    const [safetyAlerts, setSafetyAlerts] = useState(true);

    // Modal open states
    const [sessionModal, setSessionModal] = useState(false);
    const [sessionInfo, setSessionInfo] = useState(null);
    const [blockedModal, setBlockedModal] = useState(false);
    const [blockedList, setBlockedList] = useState([]);
    const [tosModal, setTosModal] = useState(false);
    const [privacyModal, setPrivacyModal] = useState(false);

    // 2FA flow states
    const [twoFAModal, setTwoFAModal] = useState(false);
    const [twoFAStep, setTwoFAStep] = useState('idle'); // idle | enrolling | scan | verifying | success | unenroll
    const [totpQR, setTotpQR] = useState('');
    const [totpSecret, setTotpSecret] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [totpFactorId, setTotpFactorId] = useState('');
    const [twoFAError, setTwoFAError] = useState('');
    const [twoFALoading, setTwoFALoading] = useState(false);

    // ── Load settings from Express API ──────────────────────────────────────
    useEffect(() => {
        if (!user?.id) return;

        const fetchSettings = async () => {
            try {
                const data = await userExtras.getSettings();
                if (data) {
                    setProfileVisible(data.profileVisible ?? true);
                    setEmailNotifs(data.emailNotifications ?? true);
                    setPushNotifs(data.pushNotifications ?? true);
                    setSmsNotifs(data.smsNotifications ?? false);
                    setSafetyAlerts(data.safetyAlerts ?? true);
                }
            } catch (err) {
                console.warn('Failed to load settings:', err);
            }
        };

        fetchSettings();
    }, [user?.id]);

    // ── Persist a single setting ────────────────────────────────────────────
    const updateSetting = async (key, value) => {
        if (!user?.id) return;
        try {
            await userExtras.updateSettings({ [key]: value });
        } catch (err) {
            console.error(`Error updating ${key}:`, err);
        }
    };

    // ── Simple toggle handlers ──────────────────────────────────────────────
    const handleProfileVisChange = (val) => { setProfileVisible(val); updateSetting('profileVisible', val); };
    const handleEmailNotifsChange = (val) => { setEmailNotifs(val); updateSetting('emailNotifications', val); };
    const handleSmsNotifsChange = (val) => { setSmsNotifs(val); updateSetting('smsNotifications', val); };
    const handleSafetyAlertsChange = (val) => { setSafetyAlerts(val); updateSetting('safetyAlerts', val); };

    // Push notifications — request browser permission first
    const handlePushNotifsChange = async (val) => {
        if (val && 'Notification' in window && Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Push notifications were blocked. Please enable them in your browser/device settings.');
                return;
            }
        }
        setPushNotifs(val);
        updateSetting('pushNotifications', val);
    };

    // ── Two-Factor Authentication (coming soon) ────────────────────────────
    const handleTwoFAChange = (val) => {
        // 2FA via TOTP is not yet implemented — show placeholder
        setTwoFA(val);
        updateSetting('twoFactorEnabled', val);
    };

    const handleTotpVerify = () => {};
    const handleTotpUnenroll = async () => {
        setTwoFA(false);
        updateSetting('twoFactorEnabled', false);
        setTwoFAModal(false);
        setTwoFAStep('idle');
    };

    const closeTwoFAModal = () => {
        setTwoFAModal(false);
        setTwoFAStep('idle');
        setTotpCode('');
        setTwoFAError('');
    };

    // ── Active Sessions ─────────────────────────────────────────────────────
    const handleOpenSessions = () => {
        const token = getToken();
        if (token) {
            setSessionInfo({
                email: user?.email || 'Unknown',
                lastSignIn: 'Current session',
                expiresAt: 'On logout',
                tokenPreview: token.slice(0, 24) + '...',
            });
        } else {
            setSessionInfo(null);
        }
        setSessionModal(true);
    };

    const handleSignOutAllDevices = async () => {
        if (confirm('This will sign you out. Continue?')) {
            await logout();
            navigate('/login');
        }
    };

    // ── Blocked Users ───────────────────────────────────────────────────────
    const handleOpenBlocked = async () => {
        try {
            const data = await userExtras.getBlocked();
            setBlockedList(data || []);
        } catch (err) {
            console.warn('Failed to load blocked users:', err);
            setBlockedList([]);
        }
        setBlockedModal(true);
    };

    const handleUnblock = async (blockedUser) => {
        try {
            await userExtras.unblockUser(blockedUser.id);
            setBlockedList(prev => prev.filter(u => u.id !== blockedUser.id));
        } catch (err) {
            console.error('Error unblocking:', err);
        }
    };

    // ── Password ────────────────────────────────────────────────────────────
    const handleChangePassword = async () => {
        if (!user?.email) return;
        if (confirm(`Send password reset email to ${user.email}?`)) {
            try {
                await authExtras.forgotPassword(user.email);
                alert('Password reset email sent! Check your inbox.');
            } catch (error) {
                console.error('Error sending reset email:', error);
                alert('Error sending reset email: ' + error.message);
            }
        }
    };

    const handleClearHistory = () => {
        if (confirm('Are you sure you want to clear your local search history?')) {
            secureRemove('search_history');
            alert('Search history cleared.');
        }
    };

    const handleExportData = () => {
        if (!user) return;
        // eslint-disable-next-line no-unused-vars
        const { access_token, refresh_token, aud, app_metadata, identities, ...safeData } = user;
        const exportPayload = {
            id: safeData.id,
            email: safeData.email,
            name: safeData.name,
            username: safeData.username,
            gender: safeData.gender,
            isPaid: safeData.isPaid,
            isVerified: safeData.isVerified,
            created_at: safeData.created_at,
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', 'redflag_user_data.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        const confirmDelete = prompt("Type 'DELETE' to permanently delete your account. This cannot be undone.");
        if (confirmDelete === 'DELETE') {
            try {
                setLoading(true);
                await userExtras.deleteAccount();
                alert('Your account data has been deleted. You will now be signed out.');
                await logout();
                navigate('/login');
            } catch (error) {
                console.error('Error deleting account:', error);
                alert('Failed to delete account: ' + error.message);
            } finally {
                setLoading(false);
            }
        }
    };

    // ── UI helpers ──────────────────────────────────────────────────────────
    const Toggle = ({ checked, onChange, id }) => (
        <div className="relative inline-block w-10 align-middle select-none">
            <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 checked:right-0 checked:border-primary transition-all duration-300 ease-in-out"
            />
            <label
                htmlFor={id}
                className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer dark:bg-gray-600 transition-colors duration-300"
            />
        </div>
    );

    const SettingRow = ({ icon, iconBg, title, subtitle, children, onClick }) => {
        const iconColor = iconBg.includes('red') ? 'text-red-500'
            : iconBg.includes('blue') ? 'text-blue-500'
                : iconBg.includes('green') ? 'text-green-500'
                    : iconBg.includes('orange') ? 'text-orange-500'
                        : iconBg.includes('purple') ? 'text-purple-500'
                            : iconBg.includes('primary') ? 'text-primary'
                                : 'text-gray-500';
        return (
            <div
                onClick={onClick}
                className={`p-4 flex items-center justify-between ${onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5' : ''} transition-colors`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
                        <span className={`material-icons text-lg ${iconColor}`}>{icon}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
                        {subtitle && <span className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>}
                    </div>
                </div>
                {children || <span className="material-icons text-gray-400 text-lg">chevron_right</span>}
            </div>
        );
    };

    const SectionHeader = ({ title }) => (
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">{title}</h3>
    );

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-lg border-b border-gray-200 dark:border-white/5">
                <div className="flex items-center justify-between px-4 py-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1.5 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                    >
                        <span className="material-icons">chevron_left</span>
                    </button>
                    <h1 className="text-lg font-bold">Settings & Privacy</h1>
                    <div className="w-8" />
                </div>
            </header>

            <main className="px-4 py-6 space-y-6 pb-24 max-w-md mx-auto">
                {/* Account Security */}
                <section>
                    <SectionHeader title="Account Security" />
                    <div className="bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        <SettingRow
                            icon="lock"
                            iconBg="bg-blue-500/10"
                            title="Change Password"
                            subtitle="Send reset email"
                            onClick={handleChangePassword}
                        />
                        <SettingRow
                            icon="security"
                            iconBg="bg-green-500/10"
                            title="Two-Factor Authentication"
                            subtitle={twoFA ? 'Enabled — TOTP active' : 'Not enabled'}
                        >
                            <Toggle id="two-fa" checked={twoFA} onChange={handleTwoFAChange} />
                        </SettingRow>
                        <SettingRow
                            icon="devices"
                            iconBg="bg-purple-500/10"
                            title="Active Sessions"
                            subtitle="View current session details"
                            onClick={handleOpenSessions}
                        />
                        <SettingRow
                            icon="verified_user"
                            iconBg="bg-blue-600/10"
                            title="Verify Identity"
                            subtitle={user?.isVerified ? 'Verified ✓' : 'Get the blue checkmark'}
                            onClick={() => navigate('/verify')}
                        />
                    </div>
                </section>

                {/* Privacy Controls */}
                <section>
                    <SectionHeader title="Privacy Controls" />
                    <div className="bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        <SettingRow
                            icon="visibility"
                            iconBg="bg-primary/10"
                            title="Profile Visibility"
                            subtitle={profileVisible ? 'Visible to others' : 'Hidden from search'}
                        >
                            <Toggle id="profile-vis" checked={profileVisible} onChange={handleProfileVisChange} />
                        </SettingRow>
                        <SettingRow
                            icon="delete_sweep"
                            iconBg="bg-orange-500/10"
                            title="Clear Search History"
                            subtitle="Remove all past searches"
                            onClick={handleClearHistory}
                        />
                        <SettingRow
                            icon="download"
                            iconBg="bg-blue-500/10"
                            title="Export My Data"
                            subtitle="Download a copy of your data"
                            onClick={handleExportData}
                        />
                        <SettingRow
                            icon="block"
                            iconBg="bg-red-500/10"
                            title="Blocked Users"
                            subtitle={blockedList.length > 0 ? `${blockedList.length} blocked` : 'Manage blocked accounts'}
                            onClick={handleOpenBlocked}
                        />
                    </div>
                </section>

                {/* Notification Preferences */}
                <section>
                    <SectionHeader title="Notification Preferences" />
                    <div className="bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        <SettingRow
                            icon="email"
                            iconBg="bg-blue-500/10"
                            title="Email Notifications"
                            subtitle="Report updates & safety alerts"
                        >
                            <Toggle id="email-notifs" checked={emailNotifs} onChange={handleEmailNotifsChange} />
                        </SettingRow>
                        <SettingRow
                            icon="notifications_active"
                            iconBg="bg-green-500/10"
                            title="Push Notifications"
                            subtitle="Real-time alerts"
                        >
                            <Toggle id="push-notifs" checked={pushNotifs} onChange={handlePushNotifsChange} />
                        </SettingRow>
                        <SettingRow
                            icon="sms"
                            iconBg="bg-purple-500/10"
                            title="SMS Alerts"
                            subtitle="Critical safety warnings only"
                        >
                            <Toggle id="sms-notifs" checked={smsNotifs} onChange={handleSmsNotifsChange} />
                        </SettingRow>
                        <SettingRow
                            icon="shield"
                            iconBg="bg-red-500/10"
                            title="Safety Alerts"
                            subtitle="Nearby flagged individuals"
                        >
                            <Toggle id="safety-alerts" checked={safetyAlerts} onChange={handleSafetyAlertsChange} />
                        </SettingRow>
                    </div>
                </section>

                {/* About */}
                <section>
                    <SectionHeader title="About" />
                    <div className="bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        <SettingRow
                            icon="description"
                            iconBg="bg-gray-200 dark:bg-white/5"
                            title="Terms of Service"
                            onClick={() => setTosModal(true)}
                        />
                        <SettingRow
                            icon="privacy_tip"
                            iconBg="bg-gray-200 dark:bg-white/5"
                            title="Privacy Policy"
                            onClick={() => setPrivacyModal(true)}
                        />
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-white/5 flex items-center justify-center">
                                    <span className="material-icons text-lg text-gray-500">info</span>
                                </div>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">App Version</span>
                            </div>
                            <span className="text-sm text-gray-400 font-mono">v2.4.1</span>
                        </div>
                    </div>
                </section>

                {/* Danger Zone */}
                <section className="pt-2">
                    <button
                        onClick={handleDeleteAccount}
                        disabled={loading}
                        className="w-full text-sm font-medium text-red-500 py-3 rounded-xl border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : 'Delete Account'}
                    </button>
                </section>
            </main>

            {/* ── Active Sessions Modal ─────────────────────────────────────── */}
            {sessionModal && (
                <Modal title="Active Sessions" onClose={() => setSessionModal(false)}>
                    {sessionInfo ? (
                        <div className="space-y-4">
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                                <span className="material-icons text-green-500">devices</span>
                                <div>
                                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">Current Session — Active</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{sessionInfo.email}</p>
                                </div>
                            </div>
                            <div className="space-y-0 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                                <div className="flex justify-between py-3">
                                    <span className="text-gray-500">Last sign-in</span>
                                    <span className="font-medium text-right">{sessionInfo.lastSignIn}</span>
                                </div>
                                <div className="flex justify-between py-3">
                                    <span className="text-gray-500">Session expires</span>
                                    <span className="font-medium text-right">{sessionInfo.expiresAt}</span>
                                </div>
                                <div className="flex justify-between items-center py-3">
                                    <span className="text-gray-500">Token</span>
                                    <span className="font-mono text-xs text-gray-400">{sessionInfo.tokenPreview}</span>
                                </div>
                            </div>
                            <button
                                onClick={handleSignOutAllDevices}
                                className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-500 text-sm font-semibold border border-red-500/20 hover:bg-red-500/20 transition-colors"
                            >
                                Sign Out All Devices
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 text-center py-6">No active session found.</p>
                    )}
                </Modal>
            )}

            {/* ── Two-Factor Authentication Modal ──────────────────────────── */}
            {twoFAModal && (
                <Modal title="Two-Factor Authentication" onClose={closeTwoFAModal}>
                    {/* Step: enrolling (loading) */}
                    {twoFAStep === 'enrolling' && (
                        <div className="flex flex-col items-center py-8 gap-4">
                            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-gray-500">Setting up authenticator...</p>
                        </div>
                    )}

                    {/* Step: scan QR + enter code */}
                    {twoFAStep === 'scan' && (
                        <div className="space-y-5">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
                            </p>
                            <div className="flex justify-center bg-white p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                                <img src={totpQR} alt="2FA QR Code" className="w-48 h-48" />
                            </div>
                            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 text-center border border-gray-100 dark:border-white/5">
                                <p className="text-xs text-gray-500 mb-2 font-medium">Can't scan? Enter this code manually:</p>
                                <p className="font-mono text-sm tracking-widest text-gray-800 dark:text-gray-200 break-all select-all">{totpSecret}</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 font-semibold block mb-2 uppercase tracking-wider">
                                    Enter the 6-digit code from your app
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={totpCode}
                                    onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '')); setTwoFAError(''); }}
                                    placeholder="000000"
                                    className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0d0d0d] focus:outline-none focus:border-primary transition-colors"
                                />
                                {twoFAError && <p className="text-xs text-red-500 mt-2">{twoFAError}</p>}
                            </div>
                            <button
                                onClick={handleTotpVerify}
                                disabled={twoFALoading || totpCode.length !== 6}
                                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 hover:bg-primary/90 transition-colors"
                            >
                                {twoFALoading ? 'Verifying...' : 'Enable 2FA'}
                            </button>
                        </div>
                    )}

                    {/* Step: success */}
                    {twoFAStep === 'success' && (
                        <div className="flex flex-col items-center py-8 gap-4 text-center">
                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                                <span className="material-icons text-green-500 text-4xl">check_circle</span>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-gray-900 dark:text-white">2FA Enabled!</p>
                                <p className="text-sm text-gray-500 mt-1">Your account is now protected with two-factor authentication.</p>
                            </div>
                            <button
                                onClick={() => setTwoFAModal(false)}
                                className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm"
                            >
                                Done
                            </button>
                        </div>
                    )}

                    {/* Step: unenroll confirmation */}
                    {twoFAStep === 'unenroll' && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                                <span className="material-icons text-red-500 mt-0.5">warning</span>
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    Disabling 2FA will make your account significantly less secure.
                                </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Are you sure you want to disable Two-Factor Authentication?
                            </p>
                            {twoFAError && <p className="text-xs text-red-500">{twoFAError}</p>}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setTwoFAModal(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleTotpUnenroll}
                                    disabled={twoFALoading}
                                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
                                >
                                    {twoFALoading ? 'Disabling...' : 'Disable 2FA'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step: error */}
                    {twoFAStep === 'error' && (
                        <div className="flex flex-col items-center py-8 gap-4 text-center">
                            <span className="material-icons text-red-500 text-5xl">error_outline</span>
                            <p className="text-sm text-red-500">{twoFAError}</p>
                            <button
                                onClick={closeTwoFAModal}
                                className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-white/10 text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    )}
                </Modal>
            )}

            {/* ── Blocked Users Modal ───────────────────────────────────────── */}
            {blockedModal && (
                <Modal title="Blocked Users" onClose={() => setBlockedModal(false)}>
                    {blockedList.length === 0 ? (
                        <div className="text-center py-10">
                            <span className="material-icons text-gray-300 dark:text-gray-600 text-5xl">block</span>
                            <p className="text-sm font-medium text-gray-500 mt-3">No blocked users</p>
                            <p className="text-xs text-gray-400 mt-1">Users you block will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {blockedList.map((blockedUser) => (
                                <div
                                    key={blockedUser.id}
                                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                                            {blockedUser.avatar_url
                                                ? <img src={blockedUser.avatar_url} alt="" className="w-full h-full object-cover" />
                                                : <span className="material-icons text-gray-500 text-base">person</span>}
                                        </div>
                                        <span className="text-sm font-medium">{blockedUser.name || blockedUser.username || 'Unknown'}</span>
                                    </div>
                                    <button
                                        onClick={() => handleUnblock(blockedUser)}
                                        className="px-3 py-1 text-xs font-semibold text-primary border border-primary/30 rounded-full hover:bg-primary/10 transition-colors"
                                    >
                                        Unblock
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </Modal>
            )}

            {/* ── Terms of Service Modal ────────────────────────────────────── */}
            {tosModal && (
                <Modal title="Terms of Service" onClose={() => setTosModal(false)}>
                    <div className="space-y-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Last updated: January 1, 2025</p>
                        {[
                            ['1. Acceptance of Terms', 'By accessing or using RedFlag, you agree to be bound by these Terms of Service. If you do not agree, do not use the app.'],
                            ['2. Eligibility', 'You must be at least 18 years old to use RedFlag. By using the app, you represent and warrant that you meet this requirement.'],
                            ['3. User Conduct', 'You agree not to post false, misleading, or defamatory content. Abuse of the reporting system is strictly prohibited and may result in permanent account termination.'],
                            ['4. Content & Reports', 'Reports submitted must be truthful to the best of your knowledge. RedFlag reserves the right to remove content that violates community guidelines without notice.'],
                            ['5. Privacy', 'Your use of RedFlag is governed by our Privacy Policy. Community rooms are moderated and anonymous — no real names or photos are shared. Messages expire after 24 hours.'],
                            ['6. Disclaimers', 'RedFlag is provided "as is" without warranties of any kind. We do not guarantee the accuracy of user-submitted reports. Always exercise personal judgment and caution.'],
                            ['7. Limitation of Liability', 'RedFlag shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.'],
                            ['8. Changes to Terms', 'We may update these Terms at any time. Continued use of RedFlag after changes constitutes acceptance of the updated Terms.'],
                            ['9. Contact', 'For legal questions, contact us at legal@redflag.app'],
                        ].map(([heading, body]) => (
                            <div key={heading}>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{heading}</h3>
                                <p>{body}</p>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {/* ── Privacy Policy Modal ──────────────────────────────────────── */}
            {privacyModal && (
                <Modal title="Privacy Policy" onClose={() => setPrivacyModal(false)}>
                    <div className="space-y-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Last updated: January 1, 2025</p>
                        {[
                            ['1. Information We Collect', 'We collect information you provide directly (email, name, gender, profile photos) and data generated by your use of RedFlag (searches, reports, activity).'],
                            ['2. How We Use Your Information', 'Your data is used to operate and improve RedFlag, provide safety features, moderate content, and communicate with you about your account. We do not sell your personal data to third parties.'],
                            ['3. Anonymous Community Features', 'Community rooms are anonymous by design. Your username — not your real name or email — is used in community interactions. Messages expire automatically after 24 hours.'],
                            ['4. Data Security', 'We use AES-256-GCM encryption for chat messages and industry-standard practices throughout. Identity verification data is processed by Sumsub (our KYC partner) and is not stored on our servers.'],
                            ['5. Data Sharing', 'Data is shared only with service providers necessary to operate RedFlag (Supabase, Firebase, Stripe). We may disclose data if required by law or valid legal process.'],
                            ['6. Your Rights', 'You have the right to access, correct, or delete your data at any time from the Settings page. You can export your data or permanently delete your account.'],
                            ['7. Cookies & Local Storage', 'We use local storage to maintain your session and preferences. No third-party advertising trackers or cookies are used.'],
                            ['8. Children\'s Privacy', 'RedFlag is not intended for users under 18. We do not knowingly collect data from minors.'],
                            ['9. Contact', 'For privacy concerns or data requests, email privacy@redflag.app'],
                        ].map(([heading, body]) => (
                            <div key={heading}>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{heading}</h3>
                                <p>{body}</p>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            <style>{`
                .toggle-checkbox:checked { right: 0; border-color: #d411b4; }
                .toggle-checkbox:checked + .toggle-label { background-color: #d411b4; }
            `}</style>
        </div>
    );
}
