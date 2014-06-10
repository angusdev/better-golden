### view_show_page_count
- Show total pages besides the page drop down
- A link to the last page
- The total page will automatically update along with `view_check_more`

### view_prevnextbar
- Prev/next bar with reasonable width related to the window width
- If enlarge the window, the width will be relatively narrow, and vice versa.  It is expected and no plan to fix
- No prev bar on first page
- No next bar on final page, will appear if new page updated along with `view_check_more`

### view_favicon
- Show new icon if
 - has next page (first load or auto load)
 - has new post after first load
- Show idle icon if
 - Not in last page and last post is

### view_clean_layout
- Simply remove all extra element / ads in page

### view_clean_content
- Remove all extra element in threads
- Should work in `view_check_more` and `view_story_mode`

### view_golden_message_link
- Load the title and time of other golden link
- Change the underline link to be same server (url in innerHTML didn't change)
- Should work in `view_check_more` and `view_story_mode`

### view_expand_youtube
- Show thumbnail or player (set in options)
- Should work in `view_check_more` and `view_story_mode`

### view_smart_timestamp
- Should work in `view_check_more` and `view_story_mode`

### view_check_more
- Won't load ajax if already known has next page
- Should handle
 - `view_golden_message_link`
 - `view_clean_content`
 - `view_expand_youtube`
 - `view_smart_timestamp`

### view_story_mode
- Only first post has the story mode button
- Reset the last page: `localStorage['lscache-better-golden-storymode-v1-<msgid>-<userid>-lastpage']="2"`
