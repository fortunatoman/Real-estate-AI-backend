import axios from "axios";

// Rate limiting utility
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Exponential backoff retry function
const retryWithBackoff = async (fn: () => Promise<any>, maxRetries: number = 3, baseDelay: number = 1000) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (i === maxRetries - 1) throw error;
            
            // Check if it's a rate limit error
            if (error.response?.status === 429) {
                const delayMs = baseDelay * Math.pow(2, i);
                console.log(`Rate limited (429). Retrying in ${delayMs}ms... (attempt ${i + 1}/${maxRetries})`);
                await delay(delayMs);
            } else {
                throw error; // Don't retry non-rate-limit errors
            }
        }
    }
};

export const getMarket = async (results: any, userInput: string) => {
    try {
        let response: any = null;
        let housingMarket: any = null;
        let housingMarketRentals: any = null;
        let marketTrend: any = null;
        let googleData: any = null;

        if (results && results.state) {
            let state = results.state;
            let city = results.city;
            let cityState = city ? `${city}, ${state}` : state;
            
            // Wrap API calls in try-catch to handle individual failures gracefully
            try {
                response = await axios.get(`https://zillow56.p.rapidapi.com/market_sale_overview`, {
                    headers: {
                        'x-rapidapi-key': "2e5dd68fe7mshd661c7de69087c4p153130jsn820b372673ae",
                        'x-rapidapi-host': 'zillow56.p.rapidapi.com'
                    },
                    params: {
                        location: cityState
                    }
                });
            } catch (error) {
                console.log("Error fetching market sale overview:", error);
            }

            try {
                housingMarket = await axios.get('https://zillow-working-api.p.rapidapi.com/housing_market', {
                    headers: {
                        'x-rapidapi-key': '2e5dd68fe7mshd661c7de69087c4p153130jsn820b372673ae',
                        'x-rapidapi-host': 'zillow-working-api.p.rapidapi.com'
                    },
                    params: {
                        search_query: cityState,
                        home_type: 'All_Homes',
                        exclude_rentalMarketTrends: 'true',
                        exclude_neighborhoods_zhvi: 'true'
                    },
                });
            } catch (error) {
                console.log("Error fetching housing market data:", error);
            }

            try {
                housingMarketRentals = await axios.get('https://zillow-working-api.p.rapidapi.com/rental_market', {
                    headers: {
                        'x-rapidapi-key': '2e5dd68fe7mshd661c7de69087c4p153130jsn820b372673ae',
                        'x-rapidapi-host': 'zillow-working-api.p.rapidapi.com'
                    },
                    params: {
                        search_query: cityState,
                        bedrooom_type: 'All_Bedrooms',
                        home_type: 'All_Property_Types'
                    },
                });
            } catch (error) {
                console.log("Error fetching rental market data:", error);
            }

            try {
                marketTrend = await axios.get('https://zillow-api-data.p.rapidapi.com/trend', {
                    params: {
                        durationDays: '21',
                        includeCurrentRate: 'true',
                        limit: '5',
                        program: 'Fixed30Year',
                        stateAbbreviation: state.toLowerCase().charAt(0).toUpperCase() + state.toLowerCase().slice(1)
                    },
                    headers: {
                        'x-rapidapi-key': '2e5dd68fe7mshd661c7de69087c4p153130jsn820b372673ae',
                        'x-rapidapi-host': 'zillow-api-data.p.rapidapi.com'
                    }
                });
            } catch (error) {
                console.log("Error fetching market trends:", error);
            }
        }

        // Google Custom Search with proper rate limiting and error handling
        try {
            // Check if Google API credentials are available
            if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_CSE_ID) {
                console.log("Google API credentials not configured, skipping Google search");
            } else {
                // Use retry with exponential backoff for rate limiting
                const googleResponse = await retryWithBackoff(async () => {
                    return await axios.get("https://www.googleapis.com/customsearch/v1", {
                        params: {
                            key: process.env.GOOGLE_API_KEY,
                            cx: process.env.GOOGLE_CSE_ID,
                            q: userInput
                        },
                        timeout: 10000 // 10 second timeout
                    });
                }, 3, 2000); // 3 retries, starting with 2 second delay

                if (googleResponse?.data?.items) {
                    googleData = googleResponse.data.items.map((item: any) => item.snippet);
                    console.log("Google search successful, found", googleData.length, "snippets");
                }
            }
        } catch (error: any) {
            if (error.response?.status === 429) {
                console.log("Google API rate limit exceeded. Consider upgrading your quota or implementing caching.");
            } else if (error.response?.status === 403) {
                console.log("Google API access denied. Check your API key and CSE ID.");
            } else {
                console.log("Google search error:", error.message || error);
            }
            // Continue without Google data - don't break the entire function
        }
        
        return {
            marketData: response?.data || null,
            googleData: googleData || null,
            housingMarket: housingMarket?.data || null,
            housingMarketRentals: housingMarketRentals?.data || null,
            marketTrend: marketTrend?.data || null
        };
    } catch (error) {
        console.error('Error getting market data:', error);
        // Return a default structure instead of null to prevent downstream errors
        return {
            marketData: null,
            googleData: null,
            housingMarket: null,
            housingMarketRentals: null,
            marketTrend: null
        };
    }
};