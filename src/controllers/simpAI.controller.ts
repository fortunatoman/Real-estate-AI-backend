import { Request, Response } from 'express';
import { analysisReport, classifyQuestion, queryQuestion } from '../lib/assistant';
import { listingAssistant } from '../lib/listingAssistant';
import axios from 'axios';
import { analysisAssistant } from '../lib/analysisAssistant';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import { getData, getOneHistory, saveData, updateData } from '../lib/realEstateData';
import puppeteer from 'puppeteer';
import { getDataByAddress } from '../lib/zillow';
import fs from 'fs';
import path from 'path';
import { optimizedAnalysisAssistant, optimizedListingAssistant } from '../lib/optimizedAssistant';

// For PDF processing, use pdf-parse library
const extractPdfText = async (buffer: Buffer): Promise<string> => {
    try {
        const data = await pdf(buffer);
        return data.text;
    } catch (error) {
        console.error('Error parsing PDF:', error);
        return "Error parsing PDF file.";
    }
};

export const analyzeProperty = async (req: Request, res: Response) => {
    let inputData = '';
    try {
        const { userInput, lastQuestion, id } = req.body;

        inputData = userInput;

        if (lastQuestion) {
            const question = await queryQuestion(userInput);
            if (question === 'true') {
                inputData = lastQuestion;
            } else if (question === 'false') {
                res.status(200).json({ description: 'Then ask a question again!', type: "noMessage" });
                return;
            } else {
                inputData = userInput;
            }
        }

        const classifyResult = await classifyQuestion(inputData);
        switch (classifyResult) {
            case 'listing':
                // const listingResult = await listingAssistant(inputData);
                const listingResult = await optimizedListingAssistant(inputData);
                if (id) res.status(200).json(await updateData(id, listingResult));
                else res.status(200).json(await saveData(listingResult));
                break;
            case 'analysis':
                const analysisResult = await optimizedAnalysisAssistant(inputData);
                if (id) res.status(200).json(await updateData(id, analysisResult));
                else res.status(200).json(await saveData(analysisResult));
                break;
            default:
                res.status(400).json({ message: 'Invalid question type' });
                break;
        }
    } catch (error) {
        console.error('Error analyzing property:', error);
        res.status(500).json({ error: 'Failed to analyze property' });
    }
};

export const getStreetView = async (req: Request, res: Response) => {
    try {
        const { location } = req.body;
        const response = await axios.get(location);
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error getting street view:', error);
        res.status(500).json({ error: 'Failed to get street view' });
    }
};

export const analyzeFile = async (req: Request, res: Response) => {
    let document = '';
    try {
        const file = req.file;
        if (!file) {
            res.status(400).json({ result: 'No file uploaded' });
            return;
        }
        const fileType = file.mimetype;
        if (fileType === 'application/pdf') {
            // PDF: extract text using pdf-parse
            const text = await extractPdfText(file.buffer);
            document = text;
        } else if (
            fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            fileType === 'application/vnd.ms-excel'
        ) {
            // Excel
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            document = csv;
        } else if (
            fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            fileType === 'application/msword'
        ) {
            // Word: extract text
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            document = result.value;
        } else {
            res.status(400).json({ result: 'Unsupported file type' });
            return;
        }
    } catch (err) {
        res.status(500).json({ result: 'Error analyzing file' });
        return;
    }

    let documentCleaned = document.replace("\n", "");

    try {
        const classifyResult = await classifyQuestion(documentCleaned);

        switch (classifyResult) {
            case 'listing':
                const listingResult = await listingAssistant(documentCleaned);
                res.status(200).json(listingResult);
                break;
            case 'analysis':
                const analysisResult = await analysisAssistant(documentCleaned);
                res.status(200).json(analysisResult);
                break;
            default:
                res.status(400).json({ message: 'Invalid question type' });
                break;
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to analyze property' });
    }
};

export const getHistories = async (req: Request, res: Response) => {
    try {
        const { email } = req.query;
        const response = await getData(email as string);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json("Get history error!");
    }
};

export const getHistory = async (req: Request, res: Response) => {
    const { id } = req.query;
    try {
        const response = await getOneHistory(id as string);
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json("Get a history error!");
    }
};

export const getReport = async (req: Request, res: Response) => {
    const { listing } = req.body;
    
    try {
        // Validate listing data
        if (!listing || typeof listing !== 'object') {
            res.status(400).json({ error: "Invalid listing data provided" });
            return;
        }

        if (!listing.streetAddress || !listing.city || !listing.state) {
            res.status(400).json({ error: "Missing required listing information (streetAddress, city, state)" });
            return;
        }

        console.log('Generating report for:', {
            address: `${listing.streetAddress}, ${listing.city}, ${listing.state}`,
            price: listing.price,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms
        });
        
        console.log('Starting PDF generation process...');
        
        const data = await getDataByAddress(listing.streetAddress + " " + listing.city + " " + listing.state + " " + listing.zipcode)
        
        // Validate Zillow data
        if (!data || typeof data !== 'object') {
            res.status(500).json({ error: "Failed to retrieve property data from Zillow" });
            return;
        }

        console.log('Zillow data retrieved successfully');
        
        // Get the analysis from OpenAI
        const analysisResult = await analysisReport(data);

        if (!analysisResult) {
            res.status(500).json({ error: "Failed to generate analysis" });
            return;
        }

        // Validate analysis result
        if (typeof analysisResult !== 'string') {
            res.status(500).json({ error: "Invalid analysis result format" });
            return;
        }

        if (analysisResult.length > 50000) { // 50KB limit for analysis content
            console.warn('Analysis result is very large, may cause PDF generation issues');
        }

        console.log(`Analysis result length: ${analysisResult.length} characters`);

        // Create HTML template for PDF
        const htmlTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    line-height: 1.6;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #7c3aed;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #7c3aed;
                    margin-bottom: 10px;
                }
                .property-title {
                    font-size: 28px;
                    font-weight: bold;
                    margin: 10px 0;
                    color: #222;
                }
                .property-subtitle {
                    font-size: 16px;
                    color: #666;
                    margin-bottom: 5px;
                }
                .price {
                    font-size: 24px;
                    font-weight: bold;
                    color: #7c3aed;
                    margin: 10px 0;
                }
                .property-details {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin: 15px 0;
                    flex-wrap: wrap;
                }
                .detail-item {
                    background: #f8f9fa;
                    padding: 10px 15px;
                    border-radius: 8px;
                    font-weight: 600;
                }
                .property-images {
                    display: flex;
                    justify-content: center;
                    gap: 20px;
                    margin: 20px 0;
                    flex-wrap: wrap;
                }
                .property-image {
                    width: 300px;
                    height: 200px;
                    object-fit: cover;
                    border-radius: 8px;
                    border: 2px solid #e5e7eb;
                }
                .image-placeholder {
                    width: 300px;
                    height: 200px;
                    background: #f3f4f6;
                    border: 2px dashed #d1d5db;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b7280;
                    font-weight: 600;
                }
                .content {
                    max-width: 800px;
                    margin: 0 auto;
                }
                h1, h2, h3 {
                    color: #7c3aed;
                    margin-top: 30px;
                }
                h2 {
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 10px;
                }
                .analysis-content {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 12px;
                    text-align: left;
                }
                th {
                    background-color: #7c3aed;
                    color: white;
                }
                .footer {
                    text-align: center;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #666;
                    font-size: 14px;
                }
                @media print {
                    body { margin: 0; }
                    .header { page-break-inside: avoid; }
                }
                ul, ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                li {
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="logo">💡 Simple Deals - Property Report</div>
                <div class="property-title">${listing.streetAddress || 'Property Analysis'}</div>
                <div class="property-subtitle">${listing.city || ''}, ${listing.state || ''} ${listing.zipcode || ''}</div>
                <div class="price">$${listing.price ? listing.price.toLocaleString() : 'N/A'}</div>
                <div class="property-details">
                    <div class="detail-item">${listing.bedrooms || 0} Bedrooms</div>
                    <div class="detail-item">${listing.bathrooms || 0} Bathrooms</div>
                    <div class="detail-item">${listing.livingArea ? listing.livingArea.toLocaleString() : 'N/A'} sq ft</div>
                </div>
                <div class="property-subtitle">Report Generated: ${new Date().toLocaleDateString()}</div>
            </div>
            
            <div class="content">
                <div class="analysis-content">
                    ${analysisResult}
                </div>
            </div>
            
            <div class="footer">
                <p>This report was generated by Simple Deals AI analysis system.</p>
                <p>For informational purposes only. Consult with qualified professionals before making investment decisions.</p>
            </div>
        </body>
        </html>
        `;

        // Validate HTML template size
        if (htmlTemplate.length > 1000000) { // 1MB limit
            throw new Error('HTML template too large for PDF generation');
        }

        console.log(`HTML template size: ${htmlTemplate.length} characters`);

        // Generate PDF using Puppeteer with cloud deployment support
        let browser;
        let page;
        let pdfBuffer: Uint8Array | undefined;
        let retryCount = 0;
        
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`Attempting PDF generation (attempt ${retryCount + 1}/${maxRetries})`);
                
                // Simplified launch options for better stability
                const launchOptions: any = {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--no-first-run',
                        '--disable-extensions',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding'
                    ],
                    timeout: 120000, // 2 minute timeout
                    protocolTimeout: 120000
                };

                // Add environment-specific options
                if (process.env.NODE_ENV === 'production') {
                    launchOptions.args.push(
                        '--disable-dev-shm-usage',
                        '--disable-gpu-sandbox'
                    );
                }

                // Use bundled Chromium or installed Chrome
                if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
                }

                console.log('Launching Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
                
                // Check if Puppeteer is available
                if (!puppeteer) {
                    throw new Error('Puppeteer is not available');
                }
                
                // Launch browser with error handling
                try {
                    browser = await puppeteer.launch(launchOptions);
                    console.log('Puppeteer browser launched successfully');
                } catch (launchError) {
                    console.error('Failed to launch browser:', launchError);
                    throw new Error(`Browser launch failed: ${launchError instanceof Error ? launchError.message : 'Unknown launch error'}`);
                }

                // Verify browser is working
                if (!browser) {
                    throw new Error('Browser not available after launch');
                }

                // Create page with error handling
                try {
                    page = await browser.newPage();
                    console.log('New page created successfully');
                } catch (pageError) {
                    console.error('Failed to create page:', pageError);
                    throw new Error(`Page creation failed: ${pageError instanceof Error ? pageError.message : 'Unknown page creation error'}`);
                }

                // Verify page is working
                if (!page) {
                    throw new Error('Page not available after creation');
                }

                // Set viewport and user agent for better compatibility
                try {
                    await page.setViewport({ width: 1280, height: 720 });
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    console.log('Page configuration set successfully');
                } catch (configError) {
                    console.error('Failed to configure page:', configError);
                    throw new Error(`Page configuration failed: ${configError instanceof Error ? configError.message : 'Unknown configuration error'}`);
                }

                // Set content with proper error handling
                console.log('Setting HTML content...');
                
                // Sanitize HTML content to prevent issues
                const sanitizedHtml = htmlTemplate
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
                    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
                    .replace(/javascript:/gi, '') // Remove javascript: protocols
                    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
                
                try {
                    await page.setContent(sanitizedHtml, {
                        waitUntil: 'domcontentloaded', // Changed from networkidle0 for better reliability
                        timeout: 60000
                    });
                    console.log('HTML content set successfully');
                } catch (contentError) {
                    console.error('Failed to set HTML content:', contentError);
                    throw new Error(`HTML content setting failed: ${contentError instanceof Error ? contentError.message : 'Unknown content error'}`);
                }

                // Wait for content to fully render
                console.log('Waiting for content to render...');
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Check if page is still valid
                if (page.isClosed()) {
                    throw new Error('Page was closed unexpectedly during rendering');
                }

                // Generate PDF with simplified approach
                console.log('Generating PDF...');
                
                // Use a more direct PDF generation approach with error handling
                try {
                    pdfBuffer = await page.pdf({
                        format: 'A4',
                        printBackground: true,
                        preferCSSPageSize: true,
                        margin: {
                            top: '20px',
                            right: '20px',
                            bottom: '20px',
                            left: '20px'
                        }
                    });
                } catch (pdfError) {
                    console.error('PDF generation failed:', pdfError);
                    
                    // Check if the error is related to target being closed
                    if (pdfError instanceof Error && pdfError.message.includes('Target closed')) {
                        throw new Error('PDF generation failed: Browser target was closed unexpectedly. This may indicate a browser crash or resource issue.');
                    }
                    
                    throw new Error(`PDF generation failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown PDF generation error'}`);
                }

                // Validate PDF buffer
                if (!pdfBuffer || pdfBuffer.length === 0) {
                    throw new Error('PDF generation failed: Empty buffer returned');
                }

                // Additional validation for PDF content
                if (pdfBuffer.length < 1000) {
                    throw new Error('PDF generation failed: Generated PDF appears to be too small or corrupted');
                }

                console.log(`PDF generated successfully. Buffer size: ${pdfBuffer.length} bytes`);
                
                // Successfully generated PDF, break out of retry loop
                break;

            } catch (error) {
                retryCount++;
                console.error(`Puppeteer error (attempt ${retryCount}/${maxRetries}):`, error);
                
                // Clean up resources before retry
                try {
                    if (page && !page.isClosed()) {
                        await page.close();
                        console.log('Page closed successfully');
                    }
                } catch (pageError) {
                    console.error("Error closing page:", pageError);
                }
                
                try {
                    if (browser) {
                        await browser.close();
                        console.log('Browser closed successfully');
                    }
                } catch (browserError) {
                    console.error("Error closing browser:", browserError);
                }
                
                // Force cleanup if normal cleanup fails
                try {
                    if (browser && browser.process()) {
                        browser.process()?.kill('SIGKILL');
                        console.log('Browser process force killed');
                    }
                } catch (killError) {
                    console.error("Error force killing browser:", killError);
                }
                
                if (retryCount >= maxRetries) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                    throw new Error(`PDF generation failed after ${maxRetries} attempts: ${errorMessage}`);
                }
                
                // Wait before retry with exponential backoff
                const waitTime = Math.min(5000 * Math.pow(2, retryCount - 1), 30000);
                console.log(`Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // Validate PDF buffer before proceeding
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('PDF generation failed: No valid PDF buffer available');
        }

        console.log('PDF generation completed successfully, proceeding to file operations...');

        // Alternative approach: If Puppeteer fails, we could implement a different PDF generation method
        // For now, we'll throw an error if PDF generation fails
        if (!pdfBuffer) {
            console.error('All PDF generation attempts failed');
            throw new Error('PDF generation failed: Unable to generate PDF after multiple attempts');
        }

        // Log success details
        console.log('PDF generation summary:', {
            attempts: retryCount + 1,
            finalBufferSize: pdfBuffer.length,
            timestamp: new Date().toISOString()
        });

        // Save PDF to temporary file
        const fileName = `property-report-${listing.streetAddress?.replace(/\s+/g, '-') || 'property'}-${Date.now()}.pdf`;
        const tempPdfsDir = path.join(__dirname, '..', '..', 'temp-pdfs');
        const filePath = path.join(tempPdfsDir, fileName);

        try {
            // Ensure directory exists
            if (!fs.existsSync(tempPdfsDir)) {
                fs.mkdirSync(tempPdfsDir, { recursive: true });
                console.log('Created temp-pdfs directory');
            }

            // Write PDF to file
            fs.writeFileSync(filePath, pdfBuffer);
            console.log(`PDF saved to: ${filePath}`);

            // Verify file was written successfully
            if (!fs.existsSync(filePath)) {
                throw new Error('PDF file was not created successfully');
            }

            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                throw new Error('PDF file is empty');
            }

            console.log(`PDF file size: ${stats.size} bytes`);

            // Create download URL
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 1001}`;
            const downloadUrl = `${baseUrl}/temp-pdfs/${fileName}`;

            // Schedule file cleanup after 10 minutes
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`Cleaned up temporary file: ${fileName}`);
                    }
                } catch (error) {
                    console.error(`Error cleaning up file ${fileName}:`, error);
                }
            }, 10 * 60 * 1000); // 10 minutes

            // Return file URL instead of sending PDF directly
            res.status(200).json({
                success: true,
                downloadUrl: downloadUrl,
                fileName: fileName,
                message: 'Report generated successfully',
                fileSize: stats.size,
                timestamp: new Date().toISOString()
            });

            console.log('Report generation completed successfully');

        } catch (fileError) {
            console.error("File operation error:", fileError);
            throw new Error(`Failed to save PDF file: ${fileError instanceof Error ? fileError.message : 'Unknown file error'}`);
        }

    } catch (error) {
        console.error("Get report error:", error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // // Log additional error details for debugging
        // console.error("Error details:", {
        //     message: errorMessage,
        //     stack: errorStack,
        //     timestamp: new Date().toISOString(),
        //     listing: listing ? {
        //         address: `${listing.streetAddress}, ${listing.city}, ${listing.state}`,
        //         hasData: !!listing
        //     } : 'No listing data',
        //     retryAttempts: retryCount || 0,
        //     browserLaunched: !!(browser || false),
        //     pageCreated: !!(page || false)
        // });
        
        res.status(500).json({ 
            error: "Failed to generate report",
            details: errorMessage,
            timestamp: new Date().toISOString(),
            requestId: Date.now().toString(),
            retryAttempts: 0
        });
    } finally {
        console.log('Get report function completed');
    }
};

export const getHomeDetails = async (req: Request, res: Response) => {
    const { address } = req.query;
    try {
        const response = await fetch(`https://zillow56.p.rapidapi.com/search_address?address=${address}`, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': "2e5dd68fe7mshd661c7de69087c4p153130jsn820b372673ae",
                'x-rapidapi-host': 'zillow56.p.rapidapi.com'
            }
        });
        const data = await response.json();
        const results = data.originalPhotos.map((item: any) => {
            return item.mixedSources.jpeg[0].url;
        })
        res.status(200).json(results);
    } catch (error) {
        res.status(500).json("Get home details error!");
    }
};

export const downloadReport = async (req: Request, res: Response) => {
    const { fileName } = req.query;
    const filePath = path.join(__dirname, '..', '..', 'temp-pdfs', fileName as string);
    res.download(filePath);
};