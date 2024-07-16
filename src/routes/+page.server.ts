import { CLOUDFLARE_ZONE_IDS, STALWART_ACCESS_TOKEN, STALWART_INSTANCE_URL } from "$env/static/private";
import type { Record as DNSRecord } from "cloudflare/resources/dns/records.mjs";
import type { Zone } from "cloudflare/resources/zones/zones.mjs";
import { CLOUDFLARE } from "$lib/server/cloudflare";
import type { Actions } from "./$types";

type ServerRecord = { type: string; name: string; content: string; id?: string };
type AnalysisResult = Array<{ target: ServerRecord; sync: boolean; actual?: ServerRecord }>;

function transformToServer(record: DNSRecord): ServerRecord {
    const name = record.name;
    const id = record.id;
    if (record.type === "MX") {
        return {
            id,
            type: "MX",
            name,
            content: `${record.priority} ${record.content}.`
        };
    }
    if (record.type === "TXT") {
        return {
            id,
            type: "TXT",
            name,
            content: record.content
        };
    }
    if (record.type === "SRV") {
        return {
            id,
            type: "SRV",
            name,
            content: `${record.data.priority} ${record.data.weight} ${record.data.port} ${record.data.target}.`
        };
    }
    if (record.type === "CNAME") {
        return {
            id,
            type: "CNAME",
            name,
            content: `${record.content}.`
        };
    }
    if (record.type === "TLSA") {
        return {
            id,
            type: "TLSA",
            name,
            content: `${record.data.usage} ${record.data.selector} ${record.data.matching_type} ${record.data.certificate}`
        };
    }
    if (record.type === "A" || record.type === "AAAA") {
        return {
            id,
            type: record.type,
            name,
            content: `${record.content}.`
        };
    }

    throw new Error("Unhandled record type " + record.type);
}

function transformToDNS(record: ServerRecord): DNSRecord {
    const name = record.name.replace(/\.$/g, "");
    const id = record.id;
    if (record.type === "MX") {
        return {
            id,
            type: "MX",
            name,
            content: record.content.split(" ")[1].replace(/\.$/g, ""),
            priority: parseInt(record.content.split(" ")[0])
        };
    }
    if (record.type === "TXT") {
        return {
            id,
            type: "TXT",
            name,
            content: record.content
        };
    }
    if (record.type === "SRV") {
        let [priority, weight, port, target] = record.content.split(" ");
        return {
            id,
            type: "SRV",
            name,
            data: {
                priority: parseInt(priority),
                weight: parseInt(weight),
                port: parseInt(port),
                target: target.replace(/\.$/g, "")
            }
        };
    }
    if (record.type === "CNAME") {
        return {
            id,
            type: "CNAME",
            name,
            content: record.content.replace(/\.$/g, "")
        };
    }
    if (record.type === "TLSA") {
        let [usage, selector, matchingType, certificate] = record.content.split(" ");
        return {
            id,
            type: "TLSA",
            name,
            data: {
                usage: parseInt(usage),
                selector: parseInt(selector),
                matching_type: parseInt(matchingType),
                certificate
            }
        };
    }

    throw new Error("Unhandled record type " + record.type);
}

async function getZone(zoneId: string): Promise<Zone> {
    return CLOUDFLARE.zones.get({ zone_id: zoneId });
}

async function getDNSInfo(zone: Zone): Promise<Array<ServerRecord>> {
    const recordsPages = await CLOUDFLARE.dns.records.list({ zone_id: zone.id });
    const records = (await Array.fromAsync(recordsPages.iterPages()))
        .map((page) => page.getPaginatedItems())
        .flat();

    return records.map(transformToServer);
}

async function getServerInfo(zone: Zone): Promise<Array<ServerRecord>> {
    const init = {
        headers: {
            Authorization: "Bearer " + STALWART_ACCESS_TOKEN
        }
    };

    let response = await fetch(`${STALWART_INSTANCE_URL}/api/domain`, init);
    const domains = (await response.json()).data.items;
    const records: Array<ServerRecord> = [];
    for (const domain of domains) {
        if (!domain.endsWith(zone.name)) continue;
        const response = await fetch(`${STALWART_INSTANCE_URL}/api/domain/${domain}`, init);
        records.push(...(await response.json()).data);
    }
    return records.map((record) => ({
        type: record.type,
        name: record.name.replace(/\.$/g, ""),
        content: record.content.replace(/ra=.+ /g, "")
    }));
}

async function analyze(): Promise<Array<{ zone: Zone; result: AnalysisResult }>> {
    return Promise.all(
        CLOUDFLARE_ZONE_IDS.split(",").map(async (zoneId) => {
            const zone = await getZone(zoneId);
            const dnsRecords = await getDNSInfo(zone);
            const serverRecords = await getServerInfo(zone);

            const result: AnalysisResult = [];
            for (const serverRecord of serverRecords) {
                if (
                    (serverRecord.type === "TXT" && serverRecord.name.includes("_domainkey")) ||
                    (serverRecord.type === "TXT" && serverRecord.content.startsWith("v=spf1")) ||
                    (serverRecord.type === "TXT" && serverRecord.name.includes("_mta-sts")) ||
                    (serverRecord.type === "TXT" && serverRecord.name.includes("_dmarc")) ||
                    (serverRecord.type === "TXT" && serverRecord.name.includes("_tls")) ||
                    serverRecord.type === "CNAME"
                ) {
                    const dnsRecord = dnsRecords.find(
                        (record) =>
                            record.name === serverRecord.name && record.type === serverRecord.type
                    );
                    const sync = !!dnsRecord && dnsRecord.content === serverRecord.content;
                    result.push({
                        sync: sync,
                        target: serverRecord,
                        actual: !sync ? dnsRecord : undefined
                    });
                    continue;
                }

                const dnsRecord = dnsRecords.find(
                    (record) =>
                        record.name === serverRecord.name &&
                        record.type === serverRecord.type &&
                        record.content === serverRecord.content
                );
                result.push({
                    sync: !!dnsRecord,
                    target: serverRecord
                });
            }

            return { zone, result };
        })
    );
}

export async function load() {
    return { items: await analyze() };
}

export const actions: Actions = {
    sync: async () => {
        const data = await analyze();
        for (const { zone, result } of data) {
            const records = result.filter((record) => !record.sync);
            for (const record of records) {
                if (record.actual !== undefined && record.actual.id !== undefined) {
                    await CLOUDFLARE.dns.records.update(record.actual.id, {
                        ...transformToDNS(record.target),
                        path_zone_id: zone.id
                    });
                } else {
                    await CLOUDFLARE.dns.records.create({
                        ...transformToDNS(record.target),
                        path_zone_id: zone.id
                    });
                }
            }
        }
    }
};
