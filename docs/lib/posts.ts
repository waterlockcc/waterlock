import type { PostItem } from './post-item';
import { getPosts, type Post } from './source';

export const toItem = (post: Post): PostItem => ({
  url: post.url,
  title: post.data.title,
  description: post.data.description,
  author: post.data.author,
  category: post.data.category,
  date: post.data.date,
  art: post.data.art,
  image: post.data.image,
});

export const getPostItems = () => getPosts().map(toItem);
