'use client';

import { BookOpen, Search, QrCode, Database, Download } from 'lucide-react';

export default function HowToPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="flex items-center gap-4 mb-8">
        <BookOpen size={32} className="text-primary" />
        <h1>How To Use Bici Serial Tracker</h1>
      </div>

      <div className="flex flex-col gap-8">
        <section className="card">
          <h2 className="flex items-center gap-2 mb-4"><Search size={24} /> 1. Configure Mapping Rules</h2>
          <p className="mb-4">Before scanning, you need to tell the system how to recognize your serial numbers. Go to <strong>Mapping Config</strong>:</p>
          <ul className="flex flex-col gap-2 list-disc pl-6">
            <li>Search for a product by its <strong>UPC</strong> to pull data from BigQuery.</li>
            <li>Scan an <strong>Example Serial Number</strong> to see if it matches your rule.</li>
            <li>Choose a <strong>Match Type</strong> (Prefix is recommended for most brands).</li>
            <li>If using <strong>Prefix</strong>, enter the number of characters at the start of the serial that stay constant for that model.</li>
            <li>Save the rule. All future scans starting with that prefix will automatically identify the product.</li>
          </ul>
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 mb-4"><QrCode size={24} /> 2. Start a Collection</h2>
          <p className="mb-4">Go to the <strong>Collections</strong> dashboard:</p>
          <ul className="flex flex-col gap-2 list-disc pl-6">
            <li>Create a new collection for your specific event or shipment.</li>
            <li>Click <strong>Start Scanning</strong> on an active collection.</li>
            <li>Ensure your scanner is set up to send an &quot;Enter&quot; key after each scan.</li>
            <li>Simply scan serial numbers one after another. The UI will show you if they matched a rule, were unmatched, or were duplicates.</li>
          </ul>
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 mb-4"><Database size={24} /> 3. Handle Unmatched Scans</h2>
          <p className="mb-4">If you scan a serial number that doesn&apos;t have a rule yet:</p>
          <ul className="flex flex-col gap-2 list-disc pl-6">
            <li>It will be marked as <strong>Unmatched</strong>.</li>
            <li>Go to the <strong>Unmatched</strong> tab in the navigation bar.</li>
            <li>Click <strong>Assign Product</strong> to manually search for the UPC and link it.</li>
            <li>Once assigned, it will update globally in your collection.</li>
          </ul>
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 mb-4"><Download size={24} /> 4. Export Your Data</h2>
          <p className="mb-4">When your collection is complete:</p>
          <ul className="flex flex-col gap-2 list-disc pl-6">
            <li>Go back to the <strong>Collections</strong> dashboard.</li>
            <li>Click <strong>Export CSV</strong> to download the full list of serials and product data.</li>
            <li>Click the <strong>Archive</strong> icon to close the collection and hide it from your active list.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
