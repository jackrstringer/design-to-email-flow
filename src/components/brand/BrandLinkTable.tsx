import { useState } from 'react';
import { ExternalLink, Trash2, Check, AlertTriangle, Package, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useBrandLinkIndex } from '@/hooks/useBrandLinkIndex';
import type { LinkFilter, BrandLinkIndexEntry } from '@/types/link-intelligence';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface BrandLinkTableProps {
  brandId: string;
}

export function BrandLinkTable({ brandId }: BrandLinkTableProps) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<LinkFilter>('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    links,
    total,
    totalPages,
    isLoading,
    deleteLink,
    isDeleting,
  } = useBrandLinkIndex({
    brandId,
    page,
    limit: 25,
    filter,
    search,
  });

  const handleDelete = async (link: BrandLinkIndexEntry) => {
    if (!confirm(`Delete "${link.title || link.url}"?`)) return;
    
    setDeletingId(link.id);
    try {
      await deleteLink(link.id);
      toast.success('Link deleted');
    } catch (error) {
      toast.error('Failed to delete link');
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'product':
        return <Package className="w-3 h-3" />;
      case 'collection':
        return <Layers className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'outline' => {
    switch (type) {
      case 'product':
        return 'default';
      case 'collection':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (links.length === 0 && !isLoading && !search && filter === 'all') {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No links indexed yet.</p>
        <p className="text-xs mt-1">Import from sitemap or add links manually.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by title or URL..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs h-8 text-sm"
        />
        <Select 
          value={filter} 
          onValueChange={(v) => {
            setFilter(v as LinkFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="products">Products</SelectItem>
            <SelectItem value="collections">Collections</SelectItem>
            <SelectItem value="unhealthy">Unhealthy</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {total} links
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Title</TableHead>
              <TableHead className="w-[200px]">URL</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[80px]">Health</TableHead>
              <TableHead className="w-[100px]">Last Used</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No links found
                </TableCell>
              </TableRow>
            ) : (
              links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-medium">
                    <span className="truncate block max-w-[280px]" title={link.title || ''}>
                      {link.title || '(No title)'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground truncate block max-w-[180px] inline-flex items-center gap-1"
                      title={link.url}
                    >
                      {new URL(link.url).pathname}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(link.link_type)} className="text-xs">
                      {getTypeIcon(link.link_type)}
                      <span className="ml-1 capitalize">{link.link_type}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {link.is_healthy ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {link.last_used_at 
                      ? formatDistanceToNow(new Date(link.last_used_at), { addSuffix: true })
                      : '—'
                    }
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleDelete(link)}
                      disabled={isDeleting && deletingId === link.id}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
