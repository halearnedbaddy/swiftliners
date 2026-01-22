import { useState, useRef } from 'react';
import { Copy, Smartphone, CheckCircle, ArrowRight, Loader2, Share2, ImagePlus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCloudAuth } from '@/contexts/CloudAuthContext';
import { cloudApi } from '@/services/cloudApi';

const MAX_IMAGES = 5;

interface GeneratedTransaction {
    id: string;
    paymentLink: string;
    itemName: string;
    amount: number;
    description?: string;
    images: string[];
}

export function LinkGenerator() {
    const { isAuthenticated } = useCloudAuth();
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [formData, setFormData] = useState({
        item: '',
        price: '',
        description: '',
    });
    const [images, setImages] = useState<string[]>([]);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [transaction, setTransaction] = useState<GeneratedTransaction | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const remainingSlots = MAX_IMAGES - images.length;
        if (remainingSlots <= 0) {
            setError(`Maximum ${MAX_IMAGES} images allowed`);
            return;
        }

        const filesToProcess = Array.from(files).slice(0, remainingSlots);
        setError(null);
        setIsUploadingImage(true);

        try {
            const newImages: string[] = [];
            
            for (const file of filesToProcess) {
                // Validate file type
                if (!file.type.startsWith('image/')) {
                    continue;
                }

                // Validate file size (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    continue;
                }

                // Convert to base64
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as string);
                    reader.onerror = () => reject(new Error('Failed to read file'));
                    reader.readAsDataURL(file);
                });
                
                newImages.push(base64);
            }

            if (newImages.length > 0) {
                setImages(prev => [...prev, ...newImages]);
            }
        } catch (err) {
            setError('Failed to upload images');
        } finally {
            setIsUploadingImage(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        if (activeImageIndex >= images.length - 1 && activeImageIndex > 0) {
            setActiveImageIndex(activeImageIndex - 1);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsGenerating(true);

        try {
            // If authenticated, use real Cloud API
            if (isAuthenticated) {
                const response = await cloudApi.createTransaction({
                    itemName: formData.item,
                    amount: parseFloat(formData.price),
                    description: formData.description || undefined,
                    images: images.length > 0 ? images : undefined,
                });

                if (response.success && response.data) {
                    setTransaction({
                        id: response.data.id,
                        paymentLink: response.data.paymentLink,
                        itemName: response.data.item_name,
                        amount: response.data.amount,
                        description: response.data.item_description || undefined,
                        images: response.data.itemImages || images,
                    });
                    setStep('success');
                    setActiveImageIndex(0);
                } else {
                    setError(response.error || 'Failed to create payment link');
                }
            } else {
                // Demo mode for non-authenticated users
                const mockId = `TXN-${Date.now().toString(36).toUpperCase()}`;
                const baseUrl = window.location.origin;
                setTransaction({
                    id: mockId,
                    paymentLink: `${baseUrl}/pay/${mockId}`,
                    itemName: formData.item,
                    amount: parseFloat(formData.price),
                    description: formData.description,
                    images: images,
                });
                setStep('success');
                setActiveImageIndex(0);
            }
        } catch (err) {
            console.error('Error creating transaction:', err);
            setError('Failed to create payment link. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = async () => {
        if (!transaction) return;
        try {
            await navigator.clipboard.writeText(transaction.paymentLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = transaction.paymentLink;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const shareToWhatsApp = () => {
        if (!transaction) return;
        const text = `Pay securely for ${transaction.itemName} (KES ${transaction.amount.toLocaleString()}) using PayLoom Escrow:\n${transaction.paymentLink}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const shareNative = async () => {
        if (!transaction) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Payment for ${transaction.itemName}`,
                    text: `Pay securely using PayLoom Escrow`,
                    url: transaction.paymentLink,
                });
            } catch (err) {
                console.log('Share cancelled');
            }
        } else {
            copyToClipboard();
        }
    };

    const resetForm = () => {
        setStep('form');
        setFormData({ item: '', price: '', description: '' });
        setImages([]);
        setTransaction(null);
        setError(null);
        setActiveImageIndex(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const nextImage = () => {
        if (transaction && transaction.images.length > 0) {
            setActiveImageIndex((prev) => (prev + 1) % transaction.images.length);
        }
    };

    const prevImage = () => {
        if (transaction && transaction.images.length > 0) {
            setActiveImageIndex((prev) => (prev - 1 + transaction.images.length) % transaction.images.length);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-8 text-center">
                <h2 className="text-3xl font-black text-foreground mb-2">Create Payment Link</h2>
                <p className="text-muted-foreground">Turn any product into a secure checkout link for social media.</p>
                {!isAuthenticated && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                        Demo mode: Log in to create real payment links
                    </p>
                )}
            </div>

            <div className="bg-card rounded-null shadow-xl border border-border overflow-hidden">
                {step === 'form' ? (
                    <div className="p-8">
                        <form onSubmit={handleGenerate} className="space-y-6">
                            {error && (
                                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-null text-destructive text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">What are you selling?</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Nike Air Force 1 - Size 42"
                                    className="w-full px-4 py-3 rounded-null border border-border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition font-medium"
                                    value={formData.item}
                                    onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">Price (KES)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">KES</span>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        placeholder="0.00"
                                        className="w-full pl-14 pr-4 py-3 rounded-null border border-border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition font-bold text-lg"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Multiple Product Images Upload */}
                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">
                                    Product Images (Optional) 
                                    <span className="text-muted-foreground font-normal ml-2">
                                        {images.length}/{MAX_IMAGES}
                                    </span>
                                </label>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    multiple
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />
                                
                                {/* Image Grid */}
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    {images.map((img, index) => (
                                        <div 
                                            key={index} 
                                            className="relative aspect-square rounded-null border border-border overflow-hidden bg-muted group"
                                        >
                                            <img
                                                src={img}
                                                alt={`Product ${index + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(index)}
                                                className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-null-full flex items-center justify-center hover:opacity-90 transition shadow-lg opacity-0 group-hover:opacity-100"
                                            >
                                                <X size={12} />
                                            </button>
                                            {index === 0 && (
                                                <span className="absolute bottom-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-null font-medium">
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    
                                    {/* Add Image Button */}
                                    {images.length < MAX_IMAGES && (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isUploadingImage}
                                            className="aspect-square rounded-null border-2 border-dashed border-border bg-muted/50 hover:bg-muted hover:border-primary/50 transition flex flex-col items-center justify-center gap-1 text-muted-foreground disabled:opacity-50"
                                        >
                                            {isUploadingImage ? (
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                            ) : (
                                                <>
                                                    <ImagePlus className="w-6 h-6" />
                                                    <span className="text-[10px] font-medium">Add</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                                
                                {images.length === 0 && (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingImage}
                                        className="w-full h-32 rounded-null border-2 border-dashed border-border bg-muted/50 hover:bg-muted hover:border-primary/50 transition flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
                                    >
                                        {isUploadingImage ? (
                                            <>
                                                <Loader2 className="w-8 h-8 animate-spin" />
                                                <span className="text-sm font-medium">Uploading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ImagePlus className="w-8 h-8" />
                                                <span className="text-sm font-medium">Click to upload product images</span>
                                                <span className="text-xs">PNG, JPG up to 5MB each • Max {MAX_IMAGES} images</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-foreground mb-2">Description / Condition (Optional)</label>
                                <textarea
                                    rows={3}
                                    placeholder="e.g. Brand new in box. No returns."
                                    className="w-full px-4 py-3 rounded-null border border-border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition resize-none"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isGenerating}
                                className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-null hover:opacity-90 transition transform hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Generating Secure Link...
                                    </>
                                ) : (
                                    <>
                                        Generate Link
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                ) : transaction && (
                    <div className="p-8 animate-in fade-in zoom-in duration-300">
                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Visual Card Preview */}
                            <div className="flex-1 bg-gradient-to-br from-primary/90 to-primary p-6 rounded-null text-primary-foreground shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-null-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-null-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

                                <div className="relative z-10 flex flex-col h-full justify-between min-h-[400px]">
                                    <div>
                                        <div className="flex items-center gap-2 mb-6">
                                            <div className="w-8 h-8 bg-white/20 rounded-null flex items-center justify-center">
                                                <CheckCircle className="text-white" size={20} />
                                            </div>
                                            <span className="font-black tracking-wider">PayLoom</span>
                                        </div>

                                        {/* Show product images carousel if available */}
                                        {transaction.images.length > 0 && (
                                            <div className="bg-white/10 backdrop-blur-md rounded-null p-2 mb-4 border border-white/10 relative">
                                                <img
                                                    src={transaction.images[activeImageIndex]}
                                                    alt={`${transaction.itemName} - Image ${activeImageIndex + 1}`}
                                                    className="w-full h-32 object-cover rounded-null"
                                                />
                                                
                                                {/* Image navigation */}
                                                {transaction.images.length > 1 && (
                                                    <>
                                                        <button
                                                            onClick={prevImage}
                                                            className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/50 rounded-null-full flex items-center justify-center hover:bg-black/70 transition"
                                                        >
                                                            <ChevronLeft size={14} />
                                                        </button>
                                                        <button
                                                            onClick={nextImage}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/50 rounded-null-full flex items-center justify-center hover:bg-black/70 transition"
                                                        >
                                                            <ChevronRight size={14} />
                                                        </button>
                                                        
                                                        {/* Dots indicator */}
                                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                                                            {transaction.images.map((_, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => setActiveImageIndex(idx)}
                                                                    className={`w-1.5 h-1.5 rounded-full transition ${
                                                                        idx === activeImageIndex ? 'bg-white' : 'bg-white/40'
                                                                    }`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        <div className="bg-white/10 backdrop-blur-md rounded-null p-4 mb-4 border border-white/10">
                                            <p className="text-white/70 text-xs uppercase tracking-widest mb-1">Selling</p>
                                            <h3 className="text-xl font-bold leading-tight">{transaction.itemName}</h3>
                                        </div>

                                        <div className="bg-white/10 backdrop-blur-md rounded-null p-4 border border-white/10">
                                            <p className="text-white/70 text-xs uppercase tracking-widest mb-1">Price</p>
                                            <p className="text-3xl font-black">KES {transaction.amount.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <div className="mt-8 text-center bg-white p-4 rounded-null">
                                        <div className="w-full aspect-square bg-gray-100 rounded-null mb-2 flex items-center justify-center">
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(transaction.paymentLink)}`} 
                                                alt="QR Code" 
                                                className="w-[80%] h-[80%]" 
                                            />
                                        </div>
                                        <p className="text-gray-900 font-bold text-sm">Scan to Pay Securely</p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex-1 flex flex-col justify-center gap-4">
                                <div className="text-center mb-6 md:text-left">
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Link Created!</h3>
                                    <p className="text-muted-foreground">Share this card on your story or send the link directly.</p>
                                </div>

                                <div 
                                    className="bg-muted p-4 rounded-null border border-border flex items-center justify-between mb-2 group cursor-pointer hover:bg-background transition" 
                                    onClick={copyToClipboard}
                                >
                                    <div className="overflow-hidden flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1">Payment Link</p>
                                        <code className="text-primary font-mono font-bold text-sm truncate block">
                                            {transaction.paymentLink}
                                        </code>
                                    </div>
                                    <button className="text-muted-foreground hover:text-foreground p-2 hover:bg-muted rounded-null transition ml-2 flex-shrink-0">
                                        {copied ? <CheckCircle size={20} className="text-[#5d2ba3]" /> : <Copy size={20} />}
                                    </button>
                                </div>

                                <button
                                    onClick={shareNative}
                                    className="w-full py-4 bg-primary text-primary-foreground rounded-null font-bold hover:opacity-90 transition flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
                                >
                                    <Share2 size={20} />
                                    Share Link
                                </button>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={shareToWhatsApp}
                                        className="py-3 bg-[#25D366] text-white rounded-null font-bold hover:bg-[#128C7E] transition flex items-center justify-center gap-2"
                                    >
                                        <Smartphone size={18} />
                                        WhatsApp
                                    </button>
                                    <button
                                        onClick={resetForm}
                                        className="py-3 bg-muted text-foreground rounded-null font-bold hover:bg-muted/80 transition"
                                    >
                                        New Link
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}