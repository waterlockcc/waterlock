'use client';
import { useStaticSearch } from 'fumadocs-core/search/client';
import { usePathname } from 'next/navigation';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { versionTag } from '@/lib/versions';

// Docs search over the static index from app/api/search (no server), within
// the docs version of the page you're on (the latest outside the docs).
export default function DocsSearch(props: SharedProps) {
  const search = useStaticSearch({ tag: versionTag(usePathname()) });
  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent className="search-square">
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}
