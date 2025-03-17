import { analysisAI } from "./assistant";
import { getMarket } from "./getMarket";
import { getZillow } from "./getZillow";

export const listingAssistant = async (userInput: string) => {
    const basicData = await getZillow(userInput);
    const marketData = await getMarket(basicData, userInput);

    const description = await analysisAI(userInput, marketData, basicData);

    let lastTitle: string = "";

    if (typeof description === "string") {
        const matches = description.match(/[^!]*\!+/g);
        if (matches && matches.length > 0) {
            lastTitle = matches[matches.length - 1].trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9?]+$/g, "");
        }
    }

    const results = basicData.map((item: any) => {
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
    })

    return { type: 'listing', description, title: userInput, email: "superman000309@gmail.com", lastTitle, results };
}