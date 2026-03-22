import React, { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import BottomNav from './components/BottomNav';

// Lazy-loaded pages for code splitting
const Home = React.lazy(() => import('./pages/Home'));
const SearchResults = React.lazy(() => import('./pages/SearchResults'));

const NewReport = React.lazy(() => import('./pages/NewReport'));
const Support = React.lazy(() => import('./pages/Support'));
const Alerts = React.lazy(() => import('./pages/Alerts'));
const Management = React.lazy(() => import('./pages/Management'));
const FacialScan = React.lazy(() => import('./pages/FacialScan'));
const ReportsHistory = React.lazy(() => import('./pages/ReportsHistory'));
const ChatLobby = React.lazy(() => import('./pages/ChatLobby'));
const ChatRoom = React.lazy(() => import('./pages/ChatRoom'));
const DatingHome = React.lazy(() => import('./pages/DatingHome'));
const DatingProfile = React.lazy(() => import('./pages/DatingProfile'));
const DatingChat = React.lazy(() => import('./pages/DatingChat'));
const DateCheckIn = React.lazy(() => import('./pages/DateCheckIn'));
const DatingMatches = React.lazy(() => import('./pages/DatingMatches'));
const Login = React.lazy(() => import('./pages/Login'));
const DatePlanner = React.lazy(() => import('./pages/DatePlanner'));
const DateCalendar = React.lazy(() => import('./pages/DateCalendar'));
const Signup = React.lazy(() => import('./pages/Signup'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));
const SwarmPage = React.lazy(() => import('./pages/SwarmPage'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Verification = React.lazy(() => import('./pages/Verification'));
const ReportDetail = React.lazy(() => import('./pages/ReportDetail'));
const CommunityHub = React.lazy(() => import('./pages/CommunityHub'));
const CommunityRoom = React.lazy(() => import('./pages/CommunityRoom'));
const UserProfile = React.lazy(() => import('./pages/UserProfile'));
const GuardianMode = React.lazy(() => import('./pages/GuardianMode'));
const GuardianDashboard = React.lazy(() => import('./pages/GuardianDashboard'));
const LiveDateRadar = React.lazy(() => import('./pages/LiveDateRadar'));
const SafeRideTracker = React.lazy(() => import('./pages/SafeRideTracker'));
const MatchProfile = React.lazy(() => import('./pages/MatchProfile'));
const RedFlagMap = React.lazy(() => import('./pages/RedFlagMap'));
const SafetyHistory = React.lazy(() => import('./pages/SafetyHistory'));
const VideoCall = React.lazy(() => import('./pages/VideoCall'));
const TokenWallet = React.lazy(() => import('./pages/TokenWallet'));

import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DatingProvider } from './context/DatingContext';
import ProtectedRoute from './components/ProtectedRoute';
import PremiumGate from './components/PremiumGate';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalCallHandler from './components/GlobalCallHandler';

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-gray-400 font-medium">Loading...</span>
      </div>
    </div>
  );
}

// Routes where BottomNav should NOT appear
const NO_BOTTOM_NAV = ['/login', '/signup', '/forgot-password', '/reset-password'];

function AppShell({ children }) {
  const { pathname } = useLocation();

  const hideNav = NO_BOTTOM_NAV.includes(pathname)
    || pathname.startsWith('/chat/')        // ChatRoom has own fixed input
    || pathname.startsWith('/dating/chat/') // DatingChat has own fixed input
    || pathname.startsWith('/guardian/');   // Public guardian page, no auth

  return (
    <>
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}

import { AnimatePresence } from 'framer-motion';

function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <GlobalCallHandler />
          <DatingProvider>
            <Suspense fallback={<PageLoader />}>
              <AnimatePresence mode="wait">
                <AppShell>
                  <Routes location={location} key={location.pathname}>
                    {/* Public routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Protected Routes — main tabs (Layout has Header, no BottomNav) */}
                    <Route path="/" element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }>
                      <Route index element={<Home />} />
                      <Route path="reports" element={
                        <PremiumGate feature="Reports History">
                          <ReportsHistory />
                        </PremiumGate>
                      } />
                      <Route path="community" element={<CommunityHub />} />
                      <Route path="community/:roomId" element={<CommunityRoom />} />
                      <Route path="map" element={<RedFlagMap />} />
                      <Route path="chat" element={<ChatLobby />} />
                      <Route path="alerts" element={<Alerts />} />
                      <Route path="profile" element={<Management />} />
                    </Route>

                    <Route path="/dating" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DatingHome />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/profile" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DatingProfile />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/profile/:userId" element={
                      <ProtectedRoute>
                        <MatchProfile />
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/chat/:matchId" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DatingChat />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/checkin" element={<DateCheckIn />} />
                    <Route path="/dating/live-radar/:matchId" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <LiveDateRadar />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/saferide/:sessionId" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <SafeRideTracker />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/guardian-mode" element={
                      <ProtectedRoute>
                        <GuardianMode />
                      </ProtectedRoute>
                    } />
                    {/* Public — no auth needed, access is via unguessable token */}
                    <Route path="/guardian/:token" element={<GuardianDashboard />} />
                    <Route path="/dating/matches" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DatingMatches />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/plan-date/:matchId" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DatePlanner />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/dating/calendar" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Dating Mode">
                          <DateCalendar />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/chat/:room" element={
                      <ProtectedRoute>
                        <ChatRoom />
                      </ProtectedRoute>
                    } />

                    <Route path="/results" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Search Results">
                          <SearchResults />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/report/new" element={
                      <ProtectedRoute>
                        <NewReport />
                      </ProtectedRoute>
                    } />
                    <Route path="/support" element={<Support />} />
                    <Route path="/notifications" element={
                      <ProtectedRoute>
                        <NotificationsPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    } />
                    <Route path="/safety-history" element={
                      <ProtectedRoute>
                        <SafetyHistory />
                      </ProtectedRoute>
                    } />
                    <Route path="/verify" element={
                      <ProtectedRoute>
                        <Verification />
                      </ProtectedRoute>
                    } />
                    <Route path="/report/:id" element={
                      <ProtectedRoute>
                        <ReportDetail />
                      </ProtectedRoute>
                    } />
                    <Route path="/profile/:userId" element={
                      <ProtectedRoute>
                        <UserProfile />
                      </ProtectedRoute>
                    } />
                    <Route path="/scan" element={
                      <ProtectedRoute>
                        <PremiumGate feature="Facial Recognition Scan">
                          <FacialScan />
                        </PremiumGate>
                      </ProtectedRoute>
                    } />
                    <Route path="/token" element={
                      <ProtectedRoute>
                        <TokenWallet />
                      </ProtectedRoute>
                    } />
                    <Route path="/swarm" element={
                      <ProtectedRoute>
                        <SwarmPage />
                      </ProtectedRoute>
                    } />
                    <Route path="/video-call/:roomName?" element={
                      <ProtectedRoute>
                        <VideoCall />
                      </ProtectedRoute>
                    } />
                  </Routes>
                </AppShell>
              </AnimatePresence>
            </Suspense>
          </DatingProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
