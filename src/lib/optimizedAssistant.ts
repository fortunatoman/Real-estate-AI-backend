import { openai } from './openai';
import { getMarket } from "./getMarket";
import { getZillow } from "./getZillow";

// Define tool functions for parallel execution
const tools = [
    {
        type: "function" as const,
        function: {
            name: "getPropertyListings",
            description: "Get property listings from Zillow based on search criteria",
            parameters: {
                type: "object",
                properties: {
                    searchQuery: {
                        type: "string",
                        description: "The search query for properties"
                    }
                },
                required: ["searchQuery"]
            }
        }
    },
    {
        type: "function" as const,
        function: {
            name: "getMarketAnalysis",
            description: "Get market analysis and trends for a specific area",
            parameters: {
                type: "object",
                properties: {
                    propertyData: {
                        type: "array",
                        description: "Property data to analyze"
                    },
                    userQuery: {
                        type: "string",
                        description: "User's original query"
                    }
                },
                required: ["propertyData", "userQuery"]
            }
        }
    }
];

// Tool execution functions
async function runTool(toolCall: any, userInput: string, propertyData?: any) {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args);

    switch (name) {
        case "getPropertyListings":
            return await getZillow(parsedArgs.searchQuery);
        case "getMarketAnalysis":
            return await getMarket(parsedArgs.propertyData, parsedArgs.userQuery);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

export const optimizedListingAssistant = async (userInput: string) => {
    try {
        console.log("optimizedListingAssistant", userInput);
        // Step 1: Parallel data fetching with function calling
        const [basicData, marketData] = await Promise.all([
            getZillow(userInput),
            // We'll get market data after we have basic data, so start with empty array
            Promise.resolve([])
        ]);

        // Step 2: Get market data now that we have basic data
        const marketDataResult = await getMarket(basicData, userInput);

        // Step 3: Parse user input for property count BEFORE AI analysis
        let propertyLimit = 15; // Default limit
        const countMatch = userInput.match(/(?:show me|find|I want|get|display|list)\s+(\d+)\s+(?:houses?|properties?|homes?|listings?)/i);
        if (countMatch) {
            propertyLimit = parseInt(countMatch[1]);
            console.log(`User requested ${propertyLimit} properties`);
        }

        // Step 4: Optimized AI analysis with consistent data
        const analysisPrompt = `
        ## 🧠 ROLE  
You are a **Senior Real Estate Investment Analyst Assistant**
Your mission is to deliver **expert-level investment insights** across the U.S. real estate market using:
- Property-level listings 
- Market-level datasets 
All outputs must resemble a polished **investment memo** — professional, accurate, data-driven, actionable, and grounded in **real 2025 market conditions**

---

## 🎯 OBJECTIVE

Interpret the user's request and respond with tailored insight based on their goal:

- If the user is **searching for properties** by price, features, or location — prioritize **listing-level analysis**. Then, generate a smart follow-up question that nudges them toward exploring **market trends, risks, or forecasts** 📈💬

- If the user is asking about **market trends, forecasts, or economic conditions** — start with a **macro-level insight** and generate a sharp follow-up that invites them to explore **property listings** 📉🏠

🎯 The follow-up must:
- Be **relevant** to the analysis
- Be **natural** and highly **contextual**
- Be **specific** to the city/state/ZIP
- Never be generic or templated
- Always end with "!!!" and contain **no "or"**

---

## 🔢 INPUT DATA

User Query: ${userInput}
Property Data: ${JSON.stringify(basicData.slice(0, propertyLimit))} 
Market Data: ${JSON.stringify(marketDataResult)}

---

## 🏠 PROPERTY LIMIT RULE - CRITICAL

**MANDATORY**: You MUST follow this rule exactly:

- If the user specifies a number of houses/properties (e.g., "show me 5 houses", "find 3 properties", "I want 7 homes"), display **ONLY that exact number** from the available listings
- If the user does NOT specify a number, display **exactly 15 properties** from the available listings
- Never exceed the user's specified limit
- Never show fewer than requested (unless fewer are available)
- Always respect the user's explicit property count preference

**CRITICAL ORDERING RULE**: 
- You MUST describe properties in the EXACT SAME ORDER as they appear in the Property Data array above
- Number each property description sequentially (1, 2, 3, etc.) matching the array index
- The first property in your description MUST correspond to the first property in the Property Data array
- The second property in your description MUST correspond to the second property in the Property Data array
- And so on...

Examples:
- User says "show me 3 houses" → Display exactly 3 properties in array order
- User says "find properties under $500k" → Display exactly 15 properties in array order
- User says "I want 8 homes in Austin" → Display exactly 8 properties in array order

**ORDERING FORMAT**:
- Start with "1. [Address]" for the first property in the Property Data array
- Continue with "2. [Address]" for the second property in the Property Data array
- Ensure each numbered description matches the corresponding property position in the array above

---

## 🧠 OUTPUT STYLE & RULES

🔍 Adapt to intent and tone:
- Use **listing-level analysis** if user provides property data
- Use **macro-level market commentary** if user mentions trends or regional conditions
- Always detect ZIP codes, cities, and regions, and localize your analysis
- Always add meaningful emojis to the front of the paragraph.

✅ Must do:
- Start directly with your analysis content - NO search phrases or headers about what you're analyzing
- Add **relevant emojis** (📈, 🏘️, ⚠️, 💡) to highlight insight
- Engage like a sharp, helpful advisor — not a robot
- Always be **tailored, non-templated**, investor-ready 
- If data is missing or contradictory, acknowledge it transparently
- Begin immediately with substantive market insights, not search methodology
- **ALWAYS RESPECT THE PROPERTY LIMIT RULE ABOVE**
- **PROVIDE COMPLETE AND DETAILED ANALYSIS** of each property when listing analysis is requested
- **NEVER CUT OFF MID-SENTENCE** - ensure your response is complete
- **WAIT UNTIL YOU HAVE COMPLETED YOUR FULL ANALYSIS** before ending
- **ANALYZE EACH PROPERTY THOROUGHLY** with specific details about price, features, and market positioning
- **MAINTAIN EXACT ORDER** - describe properties in the same sequence as they appear in the Property Data array
- **USE SEQUENTIAL NUMBERING** - start with "1." for the first property, "2." for the second, etc.

❌ Must not:
- Repeat fixed formats
- Ask "Would you like…" or confusing follow-ups
- Include URLs, images, or placeholder text like "click here"
- Display highlighted search phrases, key terms, or internal search queries
- Show what you are searching for or analyzing (e.g., "Historical Rental Price Trends in Boston, MA")
- Include section headers that describe your search process
- Violate the property limit rule
- Cut off descriptions mid-sentence or provide incomplete analysis
- Rush through property analysis - take time to be thorough
- End responses abruptly without completing the analysis

---

## 🧭 DYNAMIC FOLLOW-UP QUESTION

At the end of your analysis, ask a sharp follow-up like:

- After listings:  
  **!!!Should we explore current rent trends and supply forecasts in Scottsdale, Arizona?!!!**

- After macro insight:  
  **!!!Should I fetch the most promising properties on the market in Austin, TX?!!!**

Make it:
- Short, serious, and **action-driving**
- **Unique** to the preceding analysis
- Always include **location**

---

## ⚠️ CRITICAL INSTRUCTION

**YOU MUST COMPLETE YOUR ENTIRE ANALYSIS BEFORE ENDING YOUR RESPONSE.**

- If analyzing properties: Analyze EACH property completely with specific details
- If providing market insights: Provide comprehensive analysis with supporting details
- Do not stop mid-thought or mid-sentence
- Ensure your follow-up question is complete and properly formatted
- Take your time to be thorough and complete

**PROPERTY ORDERING IS CRITICAL**:
- You MUST describe properties in the EXACT order they appear in the Property Data array
- Use sequential numbering (1, 2, 3, etc.) that matches the array position
- The first property you describe MUST be the first property in the Property Data array
- This ensures users can easily match your descriptions with the property cards displayed

---

Now use this structure to analyze the given input. Respond like a smart investment partner — informative, detailed, visually helpful, and always one step ahead. Remember: **ALWAYS RESPECT THE PROPERTY LIMIT RULE**, **PROVIDE COMPLETE DESCRIPTIONS**, and **NEVER CUT OFF MID-ANALYSIS**.
        `;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Faster model
            messages: [
                { role: 'user', content: analysisPrompt }
            ],
            max_tokens: 1500, // Significantly increased for complete descriptions
            temperature: 0.3,
            presence_penalty: 0.1, // Encourage complete responses
            frequency_penalty: 0.1 // Reduce repetition
        });

        let description = completion.choices[0].message.content?.trim();

        // Check if description was truncated and regenerate if needed
        if (description && description.length < 500) {
            console.log('Description appears truncated, regenerating with higher token limit...');
            
            const retryPrompt = `${analysisPrompt}\n\nIMPORTANT: Your previous response was too short. Please provide a COMPLETE and DETAILED analysis. Do not cut off mid-sentence. Ensure you analyze each property thoroughly.`;
            
            const retryCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'user', content: retryPrompt }
                ],
                max_tokens: 2000, // Even higher limit for retry
                temperature: 0.3,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            });
            
            description = retryCompletion.choices[0].message.content?.trim();
            console.log('Retry description length:', description?.length || 0);
        }

        // Extract last title for follow-up
        let lastTitle: string = "";
        if (typeof description === "string") {
            const matches = description.match(/[^!]*\!+/g);
            if (countMatch && matches && matches.length > 0) {
                lastTitle = matches[matches.length - 1].trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9?]+$/g, "");
            }
        }

        // Limit results to user-specified count or default 15 (already parsed above)
        const results = basicData.slice(0, propertyLimit).map((item: any) => {
            return {
                bathrooms: item.bathrooms,
                bedrooms: item.bedrooms,
                imgSrc: item.imgSrc,
                livingArea: item.livingArea,
                price: item.price,
                streetAddress: item.streetAddress,
                state: item.state,
                city: item.city,
                zipcode: item.zipcode,
                zillowUrl: `https://www.zillow.com/homedetails/${item.streetAddress}-${item.city}-${item.state}-${item.zipcode}/${item.zpid}_zpid/`
            }
        });

        return {
            type: 'listing',
            description,
            title: userInput,
            email: "superman000309@gmail.com",
            lastTitle,
            results
        };

    } catch (error) {
        console.error('Error in optimized listing assistant:', error);
        throw error;
    }
};

export const optimizedAnalysisAssistant = async (userInput: string) => {
    try {
        console.log("optimizedAnalysisAssistant", userInput);
        // Step 1: Parallel data fetching
        const [basicData, marketData] = await Promise.all([
            getZillow(userInput),
            Promise.resolve([]) // Will get market data after basic data
        ]);

        // Step 2: Get market data
        const marketDataResult = await getMarket(basicData, userInput);

        // Step 3: Streamlined analysis
        const analysisPrompt = `
        # 🧠 ROLE
You are a **Senior Real Estate Investment Analyst Assistant**.
Your mission is to deliver **expert-level investment insights** across the U.S. real estate market using:
- Property-level listings
- Market-level datasets

All outputs must read like a polished **investment memo**: professional, data-driven, actionable, and grounded in **real 2025 market conditions**.

---

# 🎯 OBJECTIVE

Interpret the user’s intent and respond with tailored insight:

- If the user is **searching for properties** (by price, features, or location) → Provide **listing-level analysis** with deep commentary on each property. End with a smart follow-up that invites them into **market trend exploration**.

- If the user is asking about **market trends, forecasts, or economic conditions** → Provide **macro-level market analysis** (no property list). End with a sharp follow-up that invites them into **property-level exploration**.

✅ Follow-ups must:
- Be **specific** to the location mentioned
- Be **natural, relevant, and contextual**
- End with **!!!**
- Contain **no “or”** phrasing

---

# 🔢 INPUT DATA

- **User Query**: ${userInput}
- **Property Data**: ${JSON.stringify(basicData)}
- **Market Data**: ${JSON.stringify(marketDataResult)}

---

# 🏠 PROPERTY LIMIT RULE (MANDATORY)

- When analyzing properties:
  - **Respect the sequence** of properties in the data
  - **Thoroughly analyze each property** (price, features, positioning, risks)
  - Do **not** summarize in bulk or cut off analysis early

---

# 🧠 OUTPUT STYLE & RULES

🔍 **Intent Detection**
- If user asks about **market trends** → Deliver **macro insights only** (no property list).
- If user asks about **properties** → Deliver **listing-level analysis** with full detail.

✅ Always:
- Begin **immediately with substantive insights** (no prefaces like “Here’s what I found”).
- Use **investment-style emojis** (📈, 🏠, ⚠️, 💡) to emphasize points.
- Be **thorough, professional, investor-ready**.
- **Acknowledge missing/contradictory data** transparently.
- Write in a **polished investment memo tone**.
- End with a **location-specific follow-up question** that drives next steps.

❌ Never:
- Ask “Would you like…”
- Include URLs, placeholders, or process explanations
- Use generic or templated follow-ups
- Violate property limit rules
- Cut off mid-analysis

---

# 🧭 FOLLOW-UP QUESTION (MANDATORY)

- After property analysis → Invite user to explore **market trends in that same location**
- After market analysis → Invite user to explore **property listings in that same location**

✅ Example:
- After listings: "!!!Should we explore current rent trends and absorption forecasts in Scottsdale, AZ?!!!"
- After market insights: "!!!Should I surface the most promising multifamily opportunities now listed in Austin, TX?!!!"
        `;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: analysisPrompt }
            ],
            max_tokens: 1500, // Significantly increased for complete descriptions
            temperature: 0.3,
            presence_penalty: 0.1, // Encourage complete responses
            frequency_penalty: 0.1 // Reduce repetition
        });

        let description = completion.choices[0].message.content?.trim();

        // Check if description was truncated and regenerate if needed
        if (description && description.length < 500) {
            console.log('Analysis description appears truncated, regenerating with higher token limit...');
            
            const retryPrompt = `${analysisPrompt}\n\nIMPORTANT: Your previous response was too short. Please provide a COMPLETE and DETAILED market analysis. Do not cut off mid-sentence. Ensure you provide comprehensive insights.`;
            
            const retryCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'user', content: retryPrompt }
                ],
                max_tokens: 2000, // Even higher limit for retry
                temperature: 0.3,
                presence_penalty: 0.1,
                frequency_penalty: 0.1
            });
            
            description = retryCompletion.choices[0].message.content?.trim();
            console.log('Retry analysis description length:', description?.length || 0);
        }

        // Extract last title
        let lastTitle: string = "";
        if (typeof description === "string") {
            const matches = description.match(/[^!]*\!+/g);
            if (matches && matches.length > 0) {
                lastTitle = matches[matches.length - 1].trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9?]+$/g, "");
            }
        }

        console.log(`Analysis description length: ${description?.length || 0} characters`);
        console.log(`Analysis description preview: ${description?.substring(0, 200)}...`);

        return {
            type: 'analysis',
            description,
            title: userInput,
            email: "superman000309@gmail.com",
            lastTitle
        };

    } catch (error) {
        console.error('Error in optimized analysis assistant:', error);
        throw error;
    }
};
