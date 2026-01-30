import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBrandLinkIndex } from '@/hooks/useBrandLinkIndex';
import { toast } from 'sonner';

interface AddLinkModalProps {
  brandId: string;
  onLinkAdded?: () => void;
}

export function AddLinkModal({ brandId, onLinkAdded }: AddLinkModalProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [linkType, setLinkType] = useState<'product' | 'collection' | 'page'>('product');

  const { addLink, isAdding } = useBrandLinkIndex({ brandId });

  const handleSubmit = async () => {
    if (!title.trim() || !url.trim()) {
      toast.error('Title and URL are required');
      return;
    }

    try {
      await addLink({ title: title.trim(), url: url.trim(), link_type: linkType });
      toast.success('Link added');
      setOpen(false);
      setTitle('');
      setUrl('');
      setLinkType('product');
      onLinkAdded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Link</DialogTitle>
          <DialogDescription>
            Manually add a product or collection URL to the index.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g., Floral Midi Dress"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              placeholder="/products/floral-midi-dress or full URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Relative paths (starting with /) will be auto-prefixed with the brand domain
            </p>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={linkType} onValueChange={(v) => setLinkType(v as 'product' | 'collection' | 'page')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="collection">Collection</SelectItem>
                <SelectItem value="page">Page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isAdding || !title || !url}>
            {isAdding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Link'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
