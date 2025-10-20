import dynamic from "next/dynamic";

const AiSportsMarketsContainer = dynamic(
  async () => {
    const exported = await import("../../components/aisports/ai-sports-markets-container");
    return exported.AiSportsMarketsContainer;
  },
  { ssr: false }
);

const Page = () => {
  return (
    <div className="page">
      <AiSportsMarketsContainer />
    </div>
  );
};

export default Page;
