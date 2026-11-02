import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fil CRM",
    short_name: "Fil",
    description: "Le CRM qui se remplit tout seul",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#0f6e5a",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
