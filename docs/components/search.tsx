'use client';
import { useStaticSearch } from 'fumadocs-core/search/client';
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

// Docs search over the static index from app/api/search (no server).
export default function DocsSearch(props: SharedProps) {
  const search = useStaticSearch({});
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
