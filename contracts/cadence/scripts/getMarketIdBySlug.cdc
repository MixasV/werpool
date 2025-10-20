import CoreMarketHub from "CoreMarketHub"

access(all) fun main(slug: String): UInt64? {
    let view = CoreMarketHub.getMarketViewBySlug(slug: slug)
    if view == nil {
        return nil
    }
    return view!.id
}
