
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { reportsService } from '../services/reportsService';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseEther } from 'viem';
import { RFLAG_ADDRESS, RADAR_CONTRACT_ADDRESS, ERC20_ABI, REDFLAG_RADAR_ABI } from '../config/contracts';
export default function NewReport() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const toast = useToast();

    // Form State
    const [name, setName] = useState('');
    const [handle, setHandle] = useState('');
    const [selectedFlags, setSelectedFlags] = useState([]);
    const [details, setDetails] = useState('');
    const [status, setStatus] = useState('idle'); // idle, uploading, submitting, success, error
    const [photoFiles, setPhotoFiles] = useState([]); // Store actual File objects
    const [photoPreviews, setPhotoPreviews] = useState([]); // Store preview URLs

    const handlePhotoUpload = (e) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const imageUrl = URL.createObjectURL(file);
            setPhotoFiles([...photoFiles, file]);
            setPhotoPreviews([...photoPreviews, imageUrl]);
        }
    };

    const toggleFlag = (flag) => {
        if (selectedFlags.includes(flag)) {
            setSelectedFlags(selectedFlags.filter(f => f !== flag));
        } else {
            setSelectedFlags([...selectedFlags, flag]);
        }
    };

    // Web3 State
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();

    // Read Allowance
    const { data: allowance } = useReadContract({
        address: RFLAG_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, RADAR_CONTRACT_ADDRESS],
        query: { enabled: !!address }
    });

    // Read Balance
    const { data: balance } = useReadContract({
        address: RFLAG_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
        query: { enabled: !!address }
    });

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.warning("Please provide the person's name.");
            return;
        }

        try {
            if (!address) {
                toast.error("Por favor, conecta tu wallet primero.");
                return;
            }

            const cost = parseEther('50'); // 50 $RFLAG

            if (!balance || balance < cost) {
                toast.error("Balance insuficiente de $RFLAG. Por favor compra más.");
                return;
            }

            setStatus('uploading');

            // 1. Blockchain Payment Flow
            try {
                if (!allowance || allowance < cost) {
                    toast.info("Aprobando 50 $RFLAG para el Radar...");
                    const approveTx = await writeContractAsync({
                        address: RFLAG_ADDRESS,
                        abi: ERC20_ABI,
                        functionName: 'approve',
                        args: [RADAR_CONTRACT_ADDRESS, cost],
                    });
                    // Note: In production we should wait for the receipt here.
                    toast.success("Aprobación enviada. Confirmando...");
                }

                toast.info("Pagando publicación en el Radar...");
                const reportTx = await writeContractAsync({
                    address: RADAR_CONTRACT_ADDRESS,
                    abi: REDFLAG_RADAR_ABI,
                    functionName: 'reportRedFlag',
                    args: [name || 'Unknown Location', details || 'No description'],
                });
                
                toast.success("Pago on-chain confirmado!");
            } catch (web3Error) {
                console.error("Web3 Error:", web3Error);
                toast.error("Fallo el pago on-chain. El reporte no fue publicado.");
                setStatus('idle');
                return; // Stop here, do not save off-chain
            }

            // 2. Upload Photos (Try online, but don't block submission if it fails)
            let photoUrls = [];
            try {
                photoUrls = await Promise.all(
                    photoFiles.map(file => reportsService.uploadEvidence(file))
                );
            } catch (uploadError) {
                console.warn("Photo upload failed, proceeding with offline submission:", uploadError);
            }

            setStatus('submitting');

            // 3. Create Report in off-chain DB

            await reportsService.createReport({
                name,
                handle,
                details,
                selectedFlags,
                photos: photoUrls,
                severity: photoUrls.length > 0 ? 'high' : 'medium' 
            });

            setStatus('success');
            toast.success("Report submitted! +100 $RFLAG si es confirmado 🪙");

            // 3. Navigate back
            setTimeout(() => {
                navigate('/reports'); // or home
            }, 1000);

        } catch (error) {
            console.error("Submission error:", error);
            setStatus('error');
            toast.error(`Failed to submit: ${error.message}`);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-100 font-display min-h-screen flex flex-col antialiased">
            {/* Navigation Header */}
            <header className="sticky top-0 z-40 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex justify-between items-center">
                <button onClick={() => navigate(-1)} className="text-slate-500 dark:text-slate-400 text-base font-medium hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
                    Cancel
                </button>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">New Report</h1>
                <button
                    onClick={handleSubmit}
                    disabled={status === 'uploading' || status === 'submitting'}
                    className={`text-primary font-semibold text-base hover:text-primary/80 transition-colors ${status === 'uploading' || status === 'submitting' ? 'opacity-50' : ''}`}
                >
                    {status === 'uploading' ? 'Uploading...' : status === 'submitting' ? 'Posting...' : 'Post'}
                </button>
            </header>

            <main className="flex-1 px-4 py-6 space-y-8 overflow-y-auto pb-24 max-w-md mx-auto w-full">
                {/* Evidence Photos */}
                <section className="space-y-3">
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold px-1">Evidence Photos</h2>
                    <div className="flex space-x-3 overflow-x-auto hide-scrollbar pb-2 -mx-4 px-4">
                        <button
                            onClick={() => fileInputRef.current.click()}
                            className="flex-shrink-0 w-24 h-32 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 flex flex-col items-center justify-center space-y-2 text-primary hover:bg-primary/10 transition-colors"
                        >
                            <span className="material-icons text-3xl">add_a_photo</span>
                            <span className="text-xs font-medium">Add Photo</span>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handlePhotoUpload}
                            accept="image/*"
                            className="hidden"
                        />

                        {photoPreviews.map((photo, index) => (
                            <div key={index} className="relative flex-shrink-0 w-24 h-32 rounded-xl overflow-hidden group">
                                <img alt={`Evidence ${index + 1}`} className="w-full h-full object-cover" src={photo} />
                                <button
                                    onClick={() => {
                                        setPhotoPreviews(photoPreviews.filter((_, i) => i !== index));
                                        setPhotoFiles(photoFiles.filter((_, i) => i !== index));
                                    }}
                                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <span className="material-icons text-sm">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Identity */}
                <section className="space-y-4">
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold px-1">Identity</h2>
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 ml-1" htmlFor="name">Person's Name <span className="text-primary">*</span></label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <span className="material-icons text-lg">person</span>
                                </span>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm transition-all focus:ring-2 focus:ring-primary focus:border-transparent outline-none dark:text-white"
                                    id="name"
                                    placeholder="e.g. John Doe"
                                    type="text"
                                />
                            </div>
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 ml-1" htmlFor="social">Social Media Handle</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <span className="material-icons text-lg">alternate_email</span>
                                </span>
                                <input
                                    value={handle}
                                    onChange={(e) => setHandle(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm transition-all focus:ring-2 focus:ring-primary focus:border-transparent outline-none dark:text-white"
                                    id="social"
                                    placeholder="Instagram, Tinder, etc."
                                    type="text"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Type of Red Flag */}
                <section className="space-y-3">
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold px-1">Type of Red Flag</h2>
                    <div className="flex flex-wrap gap-2">
                        {['Infidelity', 'Fake Profile', 'Escort Site', 'Harassment', 'Catfishing', 'Other'].map(cat => (
                            <label
                                key={cat}
                                onClick={() => toggleFlag(cat)}
                                className={`cursor-pointer inline-flex items-center px-4 py-2 rounded-full border text-sm font-medium transition-all select-none ${selectedFlags.includes(cat) ? 'bg-primary text-white border-primary shadow-md scale-105' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                            >
                                <input className="hidden" type="checkbox" checked={selectedFlags.includes(cat)} readOnly />
                                {cat}
                            </label>
                        ))}
                    </div>
                </section>

                {/* Details */}
                <section className="space-y-3">
                    <h2 className="text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold px-1">Details</h2>
                    <div className="relative">
                        <textarea
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={500}
                            className="block w-full p-4 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm placeholder-slate-400 focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none dark:text-white"
                            placeholder="Please describe the situation..."
                            rows="6"
                        ></textarea>
                        <div className="absolute bottom-3 right-3 text-xs text-slate-400">{details.length}/500</div>
                    </div>
                </section>


            </main>
        </div>
    );
}
