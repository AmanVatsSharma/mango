"use client"

/**
 * @file qr-scanner.tsx
 * @module admin-console
 * @description QR code scanner component for fund management
 * @author StockTrade
 * @created 2025-01-27
 */

import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QrCode, Camera, X, Upload, CheckCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { normalizeAdminAddFundsAmountInput } from "@/components/admin-console/fund-number-utils"

interface QRScannerProps {
  isOpen: boolean
  onClose: () => void
  onScanComplete: (data: { clientId: string; amount: number; utr: string }) => void
}

export function QRScanner({ isOpen, onClose, onScanComplete }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scannedData, setScannedData] = useState<any>(null)
  const [manualEntry, setManualEntry] = useState({
    clientId: "",
    amount: "",
    utr: "",
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsScanning(true)
      }
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please enter details manually.",
        variant: "destructive",
      })
    }
  }

  const stopScanning = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
      tracks.forEach((track) => track.stop())
    }
    setIsScanning(false)
  }

  const simulateQRScan = () => {
    // Simulate QR code detection
    setTimeout(() => {
      const mockData = {
        clientId: `CL${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        amount: Math.floor(Math.random() * 50000) + 1000,
        utr: `UTR${Math.random().toString(36).substr(2, 12).toUpperCase()}`,
      }
      setScannedData(mockData)
      stopScanning()
      toast({
        title: "QR Code Scanned",
        description: "Payment details extracted successfully",
      })
    }, 2000)
  }

  const handleManualSubmit = () => {
    if (!manualEntry.clientId || !manualEntry.amount || !manualEntry.utr) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    const normalizedAmount = normalizeAdminAddFundsAmountInput(manualEntry.amount)
    if (normalizedAmount === null) {
      toast({
        title: "Invalid Amount",
        description: "Amount must be a positive number",
        variant: "destructive",
      })
      return
    }

    const data = {
      clientId: manualEntry.clientId,
      amount: normalizedAmount,
      utr: manualEntry.utr,
    }

    onScanComplete(data)
    onClose()
    setManualEntry({ clientId: "", amount: "", utr: "" })
    setScannedData(null)
  }

  const handleConfirmScan = () => {
    if (scannedData) {
      onScanComplete(scannedData)
      onClose()
      setScannedData(null)
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stopScanning()
      setScannedData(null)
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-green-400 flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            QR Code Fund Scanner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!scannedData ? (
            <>
              {/* Camera Scanner */}
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-square">
                  {isScanning ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      <canvas ref={canvasRef} className="hidden" />

                      {/* Scanning Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          className="w-48 h-48 border-2 border-green-400 rounded-lg"
                          animate={{
                            boxShadow: ["0 0 0 0 rgba(34, 197, 94, 0.4)", "0 0 0 10px rgba(34, 197, 94, 0)"],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Number.POSITIVE_INFINITY,
                          }}
                        >
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
                        </motion.div>
                      </div>

                      <motion.div
                        className="absolute top-4 left-4 right-4 bg-black/80 rounded-lg p-2"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <p className="text-green-400 text-sm text-center">Position QR code within the frame</p>
                      </motion.div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Camera className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Camera not active</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {!isScanning ? (
                    <Button onClick={startScanning} className="flex-1 bg-green-600 hover:bg-green-700">
                      <Camera className="w-4 h-4 mr-2" />
                      Start Scanning
                    </Button>
                  ) : (
                    <>
                      <Button onClick={simulateQRScan} className="flex-1 bg-blue-600 hover:bg-blue-700">
                        Simulate Scan
                      </Button>
                      <Button onClick={stopScanning} variant="outline" className="border-gray-600 bg-transparent">
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Manual Entry */}
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Manual Entry</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="clientId" className="text-gray-300">
                      Client ID
                    </Label>
                    <Input
                      id="clientId"
                      value={manualEntry.clientId}
                      onChange={(e) => setManualEntry((prev) => ({ ...prev, clientId: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-white"
                      placeholder="Enter client ID"
                    />
                  </div>
                  <div>
                    <Label htmlFor="amount" className="text-gray-300">
                      Amount
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      value={manualEntry.amount}
                      onChange={(e) => setManualEntry((prev) => ({ ...prev, amount: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-white"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div>
                    <Label htmlFor="utr" className="text-gray-300">
                      UTR Number
                    </Label>
                    <Input
                      id="utr"
                      value={manualEntry.utr}
                      onChange={(e) => setManualEntry((prev) => ({ ...prev, utr: e.target.value }))}
                      className="bg-gray-800 border-gray-600 text-white"
                      placeholder="Enter UTR number"
                    />
                  </div>
                  <Button onClick={handleManualSubmit} className="w-full bg-green-600 hover:bg-green-700">
                    <Upload className="w-4 h-4 mr-2" />
                    Submit Manual Entry
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Scanned Data Confirmation */
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>

              <h3 className="text-lg font-semibold text-green-400">QR Code Scanned Successfully</h3>

              <div className="bg-gray-800 rounded-lg p-4 space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-400">Client ID:</span>
                  <span className="text-white font-mono">{scannedData.clientId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="text-green-400 font-semibold">₹{scannedData.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">UTR:</span>
                  <span className="text-white font-mono">{scannedData.utr}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => setScannedData(null)} variant="outline" className="flex-1 border-gray-600">
                  Scan Again
                </Button>
                <Button onClick={handleConfirmScan} className="flex-1 bg-green-600 hover:bg-green-700">
                  Confirm & Process
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
