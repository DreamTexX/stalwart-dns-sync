import { CLOUDFLARE_API_EMAIL, CLOUDFLARE_API_KEY } from "$env/static/private";
import Cloudflare from "cloudflare";

export const CLOUDFLARE = new Cloudflare({
    apiEmail: CLOUDFLARE_API_EMAIL,
    apiKey: CLOUDFLARE_API_KEY
});