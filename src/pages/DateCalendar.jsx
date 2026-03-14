import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { datingApi } from '../services/api';

export default function DateCalendar() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState([]);

    useEffect(() => {
        if (!user) return;
        const fetchDates = async () => {
            try {
                // Fetch matches from Express API
                const matches = await datingApi.getMatches();

                const parsedEvents = [];
                for (const m of (matches || [])) {
                    if (m.last_message?.includes('[date_invite]')) {
                        const content = m.last_message;
                        const match = content.match(/Let's meet at (.+)!📍 (.+)/);
                        const placeName = match ? match[1] : 'Unknown Place';
                        const address = match ? match[2] : '';
                        const eventDate = new Date(m.last_message_time || m.updated_at || Date.now());
                        eventDate.setDate(eventDate.getDate() + 1);
                        eventDate.setHours(19, 0, 0, 0);
                        parsedEvents.push({
                            id: m.id,
                            date: eventDate,
                            title: `Date at ${placeName}`,
                            location: address,
                            type: placeName.toLowerCase().includes('coffee') || placeName.toLowerCase().includes('cafe') ? 'coffee' : 'dinner',
                        });
                    }
                }
                setEvents(parsedEvents);
            } catch (err) {
                console.error('Error fetching dates:', err);
            }
        };
        fetchDates();
    }, [user]);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark pb-20 font-display">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 pt-6">
                <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                    <span className="material-icons text-gray-900 dark:text-white">arrow_back</span>
                </button>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Date Calendar</h1>
                <div className="w-10" />
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-between px-6 mb-4">
                <button onClick={prevMonth} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-white/10">
                    <span className="material-icons text-gray-600 dark:text-gray-300">chevron_left</span>
                </button>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                    {format(currentDate, 'MMMM yyyy')}
                </h2>
                <button onClick={nextMonth} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-white/10">
                    <span className="material-icons text-gray-600 dark:text-gray-300">chevron_right</span>
                </button>
            </div>

            {/* Calendar Grid */}
            <div className="px-4">
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                        <div key={d} className="text-center text-xs font-bold text-gray-400">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                    {days.map(day => {
                        const hasEvent = events.some(e => isSameDay(e.date, day));
                        return (
                            <div key={day.toString()} className="flex flex-col items-center">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                                        ${isSameDay(day, new Date()) ? 'bg-primary text-white font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}
                                        ${hasEvent ? 'border-2 border-purple-400' : ''}
                                    `}
                                >
                                    {format(day, 'd')}
                                </div>
                                {hasEvent && <div className="w-1 h-1 bg-purple-500 rounded-full mt-1"></div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Upcoming Events List */}
            <div className="px-4 mt-8">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Upcoming Dates</h3>
                <div className="space-y-3">
                    {events.length === 0 ? (
                        <p className="text-gray-500 text-sm italic">No dates planned yet.</p>
                    ) : (
                        events.map(event => (
                            <div key={event.id} className="bg-white dark:bg-white/5 rounded-2xl p-4 flex items-center gap-4 border border-gray-100 dark:border-white/5 shadow-sm">
                                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-300">
                                    <span className="material-icons">{event.type === 'coffee' ? 'local_cafe' : 'restaurant'}</span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 dark:text-white">{event.title}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(event.date, 'EEEE, MMM d • h:mm a')}</p>
                                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                        <span className="material-icons text-[10px]">location_on</span>
                                        {event.location}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
